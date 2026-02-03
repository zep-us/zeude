-- Update Prompt Logger Hook to include prompt_id generation and temp file storage
-- This enables optimistic + update pattern for skill tracking

-- First, disable the old prompt logger hook
UPDATE zeude_hooks SET status = 'inactive' WHERE name = 'Prompt Logger' AND event = 'UserPromptSubmit';

-- Insert updated Prompt Logger Hook with UUID generation
INSERT INTO zeude_hooks (
  name,
  event,
  description,
  script_content,
  script_type,
  is_global,
  teams,
  env,
  status
) VALUES (
  'Prompt Logger',
  'UserPromptSubmit',
  'Logs all user prompts to ClickHouse with client-generated UUID for later skill tracking updates',
  E'#!/bin/bash
# Prompt Logger Hook - Logs prompts with UUID for skill tracking
# Receives: { "session_id": "...", "prompt": "...", "cwd": "...", "timestamp": "..." }

set -e

# Read JSON from stdin
INPUT=$(cat)

# Parse fields using jq
SESSION_ID=$(echo "$INPUT" | jq -r ''.session_id // empty'')
PROMPT_TEXT=$(echo "$INPUT" | jq -r ''.prompt // empty'')
CWD=$(echo "$INPUT" | jq -r ''.cwd // empty'')
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

# Skip if no prompt
if [ -z "$PROMPT_TEXT" ]; then
  exit 0
fi

# Clean up old temp file from previous session (use session-specific file)
rm -f "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"

# Cross-platform UUID generation (macOS, Linux, Windows Git Bash)
generate_uuid() {
  # Try uuidgen (macOS, some Linux)
  if command -v uuidgen &> /dev/null; then
    uuidgen | tr ''[:upper:]'' ''[:lower:]''
    return
  fi
  # Try /proc (Linux)
  if [ -f /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
    return
  fi
  # Try PowerShell (Windows)
  if command -v powershell.exe &> /dev/null; then
    powershell.exe -Command "[guid]::NewGuid().ToString()" 2>/dev/null | tr -d ''\\r''
    return
  fi
  # Pure bash fallback (works everywhere)
  printf ''%04x%04x-%04x-%04x-%04x-%04x%04x%04x'' \
    $RANDOM $RANDOM $RANDOM $((RANDOM & 0x0fff | 0x4000)) \
    $((RANDOM & 0x3fff | 0x8000)) $RANDOM $RANDOM $RANDOM
}
PROMPT_ID=$(generate_uuid)

# Store prompt_id for PostToolUse hook (session-specific to avoid race conditions)
mkdir -p "$HOME/.zeude/tmp"
mkdir -p "$HOME/.zeude/logs"
echo "$PROMPT_ID" > "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"
chmod 600 "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"

# Get user info from environment
USER_EMAIL="${ZEUDE_USER_EMAIL:-unknown}"
TEAM="${ZEUDE_TEAM:-default}"

# Calculate prompt length
PROMPT_LENGTH=${#PROMPT_TEXT}

# Escape for JSON
PROMPT_ESCAPED=$(echo "$PROMPT_TEXT" | jq -Rs ''.'')
CWD_ESCAPED=$(echo "$CWD" | jq -Rs ''.'')

# Build ClickHouse insert payload with prompt_id
PAYLOAD=$(cat <<EOF
{
  "sessionId": "$SESSION_ID",
  "prompt": $PROMPT_ESCAPED,
  "cwd": $CWD_ESCAPED,
  "timestamp": "$TIMESTAMP",
  "promptId": "$PROMPT_ID"
}
EOF
)

# Send to API asynchronously (don''t block the prompt)
if [ -n "$ZEUDE_API_URL" ] && [ -n "$ZEUDE_AGENT_KEY" ]; then
  curl -s -X POST "${ZEUDE_API_URL}/api/prompts" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \\
    -d "$PAYLOAD" >> "$HOME/.zeude/logs/prompt-hook.log" 2>&1 &
fi

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": "", "ZEUDE_USER_EMAIL": "", "ZEUDE_TEAM": ""}'::jsonb,
  'active'
);

-- Insert PostToolUse Hook for skill tracking
INSERT INTO zeude_hooks (
  name,
  event,
  description,
  script_content,
  script_type,
  is_global,
  teams,
  env,
  status
) VALUES (
  'Skill Tracker',
  'PostToolUse',
  'Updates prompt_type to skill/command when tools are used via PATCH request',
  E'#!/bin/bash
# Skill Tracker Hook - Updates prompt_type when tools are invoked
# Receives: { "tool": "...", ... } from PostToolUse event

# Parse hook input to extract tool name and session_id
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r ''.session_id // empty'')
TOOL_NAME=$(echo "$INPUT" | jq -r ''.tool // empty'' | head -n1)

# Read prompt_id from session-specific temp file
TEMP_FILE="$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"
if [ ! -f "$TEMP_FILE" ]; then
  exit 0  # No prompt to update (natural language only or no UUID)
fi

PROMPT_ID=$(cat "$TEMP_FILE")
if [ -z "$PROMPT_ID" ]; then
  rm -f "$TEMP_FILE"
  exit 0
fi

if [ -z "$TOOL_NAME" ]; then
  exit 0  # No tool used
fi

# Determine prompt_type based on tool name
PROMPT_TYPE="skill"
TOOL_NAME_CLEAN="$TOOL_NAME"

if [[ "$TOOL_NAME" == "Skill" ]]; then
  # Skill tool invoked by Claude (e.g., user said "clarify my requirements")
  # Extract skill name from tool_input.skill
  SKILL_NAME=$(echo "$INPUT" | jq -r ''.tool_input.skill // empty'')
  if [ -z "$SKILL_NAME" ]; then
    exit 0  # No skill name found
  fi
  PROMPT_TYPE="skill"
  TOOL_NAME_CLEAN="$SKILL_NAME"
elif [[ "$TOOL_NAME" == "/"* ]]; then
  # Tool name starts with /, it''s a skill/command/agent
  TOOL_NAME_CLEAN=$(echo "$TOOL_NAME" | sed ''s/^\\///'')

  # Check if it''s a built-in command (synced with @/lib/prompt-utils.ts BUILTIN_COMMANDS)
  BUILTIN_COMMANDS=''help clear compact config cost doctor init login logout memory model permissions review status tasks vim''
  if echo "$BUILTIN_COMMANDS" | grep -qw "$TOOL_NAME_CLEAN"; then
    PROMPT_TYPE="command"
  elif [[ "$TOOL_NAME_CLEAN" == *":"* ]]; then
    # Contains colon, likely a workflow or namespaced skill
    PROMPT_TYPE="skill"
  else
    PROMPT_TYPE="skill"
  fi
elif [[ "$TOOL_NAME" == "mcp__"* ]]; then
  # MCP tool (e.g., mcp__zen__codereview, mcp__filesystem__read)
  PROMPT_TYPE="mcp_tool"
  TOOL_NAME_CLEAN="$TOOL_NAME"
else
  # Other internal tool - not tracked
  rm -f "$TEMP_FILE"
  exit 0
fi

# Only update if it''s a skill/command
if [ "$PROMPT_TYPE" != "natural" ]; then
  TOOL_NAME_ESCAPED=$(echo "$TOOL_NAME_CLEAN" | jq -Rs ''.'')
  PATCH_DATA="{\"prompt_type\":\"$PROMPT_TYPE\",\"invoked_name\":$TOOL_NAME_ESCAPED}"

  # Send PATCH request silently
  if [ -n "$ZEUDE_API_URL" ] && [ -n "$ZEUDE_AGENT_KEY" ]; then
    curl -s -X PATCH "${ZEUDE_API_URL}/api/prompts/${PROMPT_ID}" \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \\
      -d "$PATCH_DATA" >> "$HOME/.zeude/logs/prompt-hook.log" 2>&1  # Log errors for debugging
  fi
fi

# Note: Do NOT delete temp file here - multi-tool prompts need it
# Cleanup is handled by UserPromptSubmit at the start of next prompt

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": ""}'::jsonb,
  'active'
);

COMMENT ON MIGRATION IS 'Add UUID generation to Prompt Logger and create PostToolUse Skill Tracker hook for natural language skill counting';
