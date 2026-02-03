-- Skill Hint Hook v3: 2-Tier Keyword Matching with Path Filtering
-- Replaces simple substring matching with:
-- 1. Token-based filtering (removes file paths, mentions)
-- 2. Primary keywords: trigger alone (high confidence)
-- 3. Secondary keywords: need 2+ matches (lower confidence)

-- Update existing Skill Hint hook with new logic
-- Using dollar-quoting to avoid escaping issues with embedded bash script
UPDATE zeude_hooks
SET script_content = $SCRIPT$#!/bin/bash
# Skill Hint Hook v3 - 2-Tier Keyword Matching
# Primary keywords: any single match triggers suggestion
# Secondary keywords: need 2+ matches to trigger
# Path filtering: skips tokens containing / @ or starting with .

INPUT=$(cat)
PROMPT_TEXT=$(echo "$INPUT" | jq -r '.prompt // empty')
RULES_FILE="$HOME/.claude/skill-rules.json"

# Skip if prompt starts with / (already a skill/command)
[[ "$PROMPT_TEXT" == /* ]] && { echo "$PROMPT_TEXT"; exit 0; }

# Skip if no prompt or rules file
[ -z "$PROMPT_TEXT" ] && { echo "$PROMPT_TEXT"; exit 0; }
[ ! -f "$RULES_FILE" ] && { echo "$PROMPT_TEXT"; exit 0; }

# Clean prompt: remove paths (@mentions, /paths, URLs) before matching
# This prevents keywords in file paths from triggering false positives
PROMPT_LOWER=$(echo "$PROMPT_TEXT" | tr '[:upper:]' '[:lower:]')
PROMPT_CLEAN=$(echo "$PROMPT_LOWER" | sed 's|@[^ ]*||g; s|[~/][^ ]*||g; s|https\?://[^ ]*||g')

GENERAL_HINTS=""
MATCHED_HINTS=""

# Process skills with 2-tier keywords
# Output: slug<TAB>isGeneral<TAB>hint<TAB>primaryKeywords<TAB>secondaryKeywords
while IFS=$'\t' read -r skill_slug is_general hint primary_csv secondary_csv; do
  [ -z "$hint" ] && continue

  # General skills: always add
  if [ "$is_general" = "true" ]; then
    GENERAL_HINTS="${GENERAL_HINTS}- /${skill_slug} - ${hint}
"
    continue
  fi

  MATCHED=0

  # Helper: Check if keyword matches with proper boundaries
  # Korean keywords: match with optional Korean suffixes (조사)
  # English keywords: match with word boundaries
  match_keyword() {
    local kw="$1"
    local text="$2"
    if [[ "$kw" =~ ^[가-힣] ]]; then
      # Korean: keyword + optional Korean chars (handles 슬랙에, 슬랙으로, etc.)
      [[ "$text" =~ (^|[^가-힣])${kw}[가-힣]*($|[^가-힣]) ]]
    else
      # English: word boundary
      [[ "$text" =~ (^|[^a-z])${kw}($|[^a-z]) ]]
    fi
  }

  # PRIMARY CHECK: Any single match triggers
  if [ -n "$primary_csv" ]; then
    OLD_IFS="$IFS"
    IFS=','
    for kw in $primary_csv; do
      IFS="$OLD_IFS"
      [ -z "$kw" ] && continue
      if match_keyword "$kw" "$PROMPT_CLEAN"; then
        MATCHED=1
        break
      fi
    done
    IFS="$OLD_IFS"
  fi

  # SECONDARY CHECK: Need 2+ matches (only if no primary match)
  if [ "$MATCHED" -eq 0 ] && [ -n "$secondary_csv" ]; then
    SEC_COUNT=0
    OLD_IFS="$IFS"
    IFS=','
    for kw in $secondary_csv; do
      IFS="$OLD_IFS"
      [ -z "$kw" ] && continue
      if match_keyword "$kw" "$PROMPT_CLEAN"; then
        ((SEC_COUNT++))
      fi
    done
    IFS="$OLD_IFS"
    [ "$SEC_COUNT" -ge 2 ] && MATCHED=1
  fi

  # Add to matches if triggered
  if [ "$MATCHED" -eq 1 ]; then
    MATCHED_HINTS="${MATCHED_HINTS}- /${skill_slug} - ${hint}
"
  fi
done < <(jq -r 'to_entries[] | "\(.key)\t\(.value.isGeneral // false)\t\(.value.hint // "")\t\(.value.primaryKeywords // .value.keywords // [] | map(ascii_downcase) | join(","))\t\(.value.secondaryKeywords // [] | map(ascii_downcase) | join(","))"' "$RULES_FILE" 2>/dev/null)

# If no hints, pass through unchanged
if [ -z "$GENERAL_HINTS" ] && [ -z "$MATCHED_HINTS" ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

# Count matched skills
MATCHED_COUNT=$(echo -n "$MATCHED_HINTS" | grep -c "^\-" || echo 0)

# Output prompt with hints
if [ "$MATCHED_COUNT" -gt 0 ]; then
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
  cat <<EOF
$PROMPT_TEXT

---
🎯 AVAILABLE SKILLS:
${GENERAL_HINTS}
---
EOF
fi

exit 0$SCRIPT$,
    description = 'Skill hints with 2-tier keywords (primary triggers alone, secondary needs 2+) and path filtering. ~50ms latency.'
WHERE name = 'Skill Hint' AND event = 'UserPromptSubmit';

-- Comment for documentation
COMMENT ON TABLE zeude_hooks IS 'Skill Hint v3: 2-tier keyword matching (primary/secondary) with token-based path filtering';
