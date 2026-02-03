-- Seed: Prompt Logger Hook
-- This hook logs all user prompts to ClickHouse for analytics

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
  'Logs all user prompts to ClickHouse for team analytics and AI coaching',
  E'#!/bin/bash
# Prompt Logger Hook - Logs prompts to ClickHouse
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

# Get user info from environment
USER_EMAIL="${ZEUDE_USER_EMAIL:-unknown}"
TEAM="${ZEUDE_TEAM:-default}"

# Calculate prompt length
PROMPT_LENGTH=${#PROMPT_TEXT}

# Escape for JSON
PROMPT_ESCAPED=$(echo "$PROMPT_TEXT" | jq -Rs ''.'')
CWD_ESCAPED=$(echo "$CWD" | jq -Rs ''.'')

# Build ClickHouse insert payload
PAYLOAD=$(cat <<EOF
{
  "session_id": "$SESSION_ID",
  "user_email": "$USER_EMAIL",
  "team": "$TEAM",
  "timestamp": "$TIMESTAMP",
  "prompt_text": $PROMPT_ESCAPED,
  "prompt_length": $PROMPT_LENGTH,
  "project_path": $CWD_ESCAPED,
  "working_directory": $CWD_ESCAPED
}
EOF
)

# Send to API asynchronously (don''t block the prompt)
if [ -n "$ZEUDE_API_URL" ] && [ -n "$ZEUDE_AGENT_KEY" ]; then
  curl -s -X POST "${ZEUDE_API_URL}/api/prompts" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \\
    -d "$PAYLOAD" &>/dev/null &
fi

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": "", "ZEUDE_USER_EMAIL": "", "ZEUDE_TEAM": ""}'::jsonb,
  'active'
);
