-- Skill Hint Hook (v2)
-- Replaces LLM-based Skill Suggester with fast local file-based matching
-- Uses skill-rules.json synced via zeude sync

-- Deactivate old Skill Suggester if exists
UPDATE zeude_hooks SET status = 'inactive'
WHERE name = 'Skill Suggester' AND event = 'UserPromptSubmit';

-- Insert new Skill Hint Hook
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
  'Skill Hint',
  'UserPromptSubmit',
  'Adds skill hints to prompt based on local skill-rules.json. No API calls, ~50ms latency.',
  E'#!/bin/bash
# Skill Hint Hook - Fast local skill matching
# Reads skill-rules.json and adds hints for matching/general skills
# No network calls - purely local file-based (~50ms)

INPUT=$(cat)
PROMPT_TEXT=$(echo "$INPUT" | jq -r ''.prompt // empty'')
RULES_FILE="$HOME/.claude/skill-rules.json"

# Skip if prompt starts with / (already a skill/command)
[[ "$PROMPT_TEXT" == /* ]] && { echo "$PROMPT_TEXT"; exit 0; }

# Skip if no prompt
[ -z "$PROMPT_TEXT" ] && { echo "$PROMPT_TEXT"; exit 0; }

# Skip if rules file does not exist
[ ! -f "$RULES_FILE" ] && { echo "$PROMPT_TEXT"; exit 0; }

PROMPT_LOWER=$(echo "$PROMPT_TEXT" | tr ''[:upper:]'' ''[:lower:]'')

# Collect hints
GENERAL_HINTS=""
MATCHED_HINTS=""

# Process all skills in single jq call (optimized: one fork instead of 3N)
# Output format: slug<TAB>isGeneral<TAB>hint<TAB>keyword1,keyword2,...
while IFS=$''\t'' read -r skill_slug is_general hint keywords_csv; do
  # Skip if no hint
  [ -z "$hint" ] && continue

  # General skills: always add
  if [ "$is_general" = "true" ]; then
    GENERAL_HINTS="${GENERAL_HINTS}- /${skill_slug} - ${hint}
"
    continue
  fi

  # Specific skills: check keywords (already lowercased by jq)
  # Use portable string splitting (works in bash/zsh/sh)
  OLD_IFS="$IFS"
  IFS='',''
  for kw in $keywords_csv; do
    IFS="$OLD_IFS"
    [ -z "$kw" ] && continue
    if [[ "$PROMPT_LOWER" == *"$kw"* ]]; then
      MATCHED_HINTS="${MATCHED_HINTS}- /${skill_slug} - ${hint} [MATCHED]
"
      break
    fi
  done
  IFS="$OLD_IFS"
done < <(jq -r ''to_entries[] | "\(.key)\t\(.value.isGeneral // false)\t\(.value.hint // "")\t\(.value.keywords // [] | map(ascii_downcase) | join(","))"'' "$RULES_FILE" 2>/dev/null)

# If no hints, pass through unchanged
if [ -z "$GENERAL_HINTS" ] && [ -z "$MATCHED_HINTS" ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

# Count matched skills
MATCHED_COUNT=$(echo -n "$MATCHED_HINTS" | grep -c "^\-" || echo 0)

# Output prompt with hints
if [ "$MATCHED_COUNT" -gt 0 ]; then
  # Skills matched - instruct Claude to ask user
  cat <<EOF
$PROMPT_TEXT

<skill-suggestion>
🎯 MATCHED SKILLS (use AskUserQuestion to let user choose):
${MATCHED_HINTS}
IMPORTANT: Use AskUserQuestion tool to ask the user which skill to use.
- Show each matched skill as an option
- Add "Continue without skill" as the last option
- If user selects a skill, invoke it with the Skill tool
</skill-suggestion>
EOF
else
  # Only general skills - just inform
  cat <<EOF
$PROMPT_TEXT

---
🎯 AVAILABLE SKILLS:
${GENERAL_HINTS}
---
EOF
fi

exit 0',
  'bash',
  true,
  '{}',
  '{}'::jsonb,
  'active'
);

-- Migration: Add Skill Hint hook using local skill-rules.json (replaces LLM-based Skill Suggester)
