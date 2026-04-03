-- Skill Hint Hook v4: keep 2-tier matching, add low-confidence fallback
-- - Primary keywords: any single match => strong suggestion
-- - Secondary keywords: 2+ matches => strong suggestion
-- - Secondary keywords: 1 match => low-confidence suggestion (still AskUserQuestion)

UPDATE zeude_hooks
SET script_content = $SCRIPT$#!/bin/bash
# Skill Hint Hook v4 - 2-Tier + Low-Confidence Secondary Fallback
# Primary keywords: any single match triggers suggestion
# Secondary keywords: 2+ matches trigger suggestion
# Secondary keywords: 1 match is low-confidence fallback
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
WEAK_HINTS=""

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
  WEAK_MATCH=0

  # Helper: Check if keyword matches with proper boundaries
  # Korean keywords: match with optional Korean suffixes (조사)
  # English keywords: match with word boundaries
  match_keyword() {
    local kw="$1"
    local text="$2"
    if [[ "$kw" =~ ^[가-힣] ]]; then
      [[ "$text" =~ (^|[^가-힣])${kw}[가-힣]*($|[^가-힣]) ]]
    else
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

  # SECONDARY CHECK:
  # 2+ matches => strong match
  # 1 match => low-confidence fallback
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

    if [ "$SEC_COUNT" -ge 2 ]; then
      MATCHED=1
    elif [ "$SEC_COUNT" -eq 1 ]; then
      WEAK_MATCH=1
    fi
  fi

  if [ "$MATCHED" -eq 1 ]; then
    MATCHED_HINTS="${MATCHED_HINTS}- /${skill_slug} - ${hint}
"
  elif [ "$WEAK_MATCH" -eq 1 ]; then
    WEAK_HINTS="${WEAK_HINTS}- /${skill_slug} - ${hint}
"
  fi
done < <(jq -r 'to_entries[] | "\(.key)\t\(.value.isGeneral // false)\t\(.value.hint // "")\t\(.value.primaryKeywords // .value.keywords // [] | map(ascii_downcase) | join(","))\t\(.value.secondaryKeywords // [] | map(ascii_downcase) | join(","))"' "$RULES_FILE" 2>/dev/null)

# If no hints, pass through unchanged
if [ -z "$GENERAL_HINTS" ] && [ -z "$MATCHED_HINTS" ] && [ -z "$WEAK_HINTS" ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

MATCHED_COUNT=$(printf '%s' "$MATCHED_HINTS" | grep -c "^\-")
WEAK_COUNT=$(printf '%s' "$WEAK_HINTS" | grep -c "^\-")

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
elif [ "$WEAK_COUNT" -gt 0 ]; then
  cat <<EOF
$PROMPT_TEXT

<skill-suggestion>
🎯 POSSIBLE SKILLS (low confidence, use AskUserQuestion):
${WEAK_HINTS}
IMPORTANT: Use AskUserQuestion tool to ask the user which skill to use.
- Show each possible skill as an option
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
    description = 'Skill hints with 2-tier keywords + low-confidence secondary fallback (1 secondary match). ~50ms latency.'
WHERE name = 'Skill Hint' AND event = 'UserPromptSubmit';
