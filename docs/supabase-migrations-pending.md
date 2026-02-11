# Pending Supabase Migrations

> 이 문서는 로컬 git에만 있는 Supabase 마이그레이션을 정리한 것입니다.
> Supabase SQL Editor에서 순서대로 실행하세요.

## 적용 대상 파일

| 파일 | 설명 |
|------|------|
| `20250114000001_update_prompt_logger_with_uuid.sql` | Prompt Logger + Skill Tracker 훅 |
| `20250119000001_skill_suggester_hook.sql` | Skill Suggester 훅 |
| `20250211000001_add_http_mcp_type.sql` | MCP 서버에 HTTP 타입 지원 추가 |

---

## Migration 1: Prompt Logger + Skill Tracker

> UUID 기반 프롬프트 추적 및 스킬 사용 분류

```sql
-- ============================================================================
-- 1. 기존 Prompt Logger 비활성화
-- ============================================================================
UPDATE zeude_hooks SET status = 'inactive' WHERE name = 'Prompt Logger' AND event = 'UserPromptSubmit';

-- ============================================================================
-- 2. 새 Prompt Logger Hook (UUID 생성 포함)
-- ============================================================================
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
# Cross-platform: macOS, Linux, Windows (Git Bash)

set -e

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r ''.session_id // empty'')
PROMPT_TEXT=$(echo "$INPUT" | jq -r ''.prompt // empty'')
CWD=$(echo "$INPUT" | jq -r ''.cwd // empty'')
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

if [ -z "$PROMPT_TEXT" ]; then
  exit 0
fi

rm -f "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"

# Cross-platform UUID generation
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

mkdir -p "$HOME/.zeude/tmp"
mkdir -p "$HOME/.zeude/logs"
echo "$PROMPT_ID" > "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"
chmod 600 "$HOME/.zeude/tmp/prompt_${SESSION_ID}.id" 2>/dev/null || true

PROMPT_ESCAPED=$(echo "$PROMPT_TEXT" | jq -Rs ''.'')
CWD_ESCAPED=$(echo "$CWD" | jq -Rs ''.'')

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

if [ -n "$ZEUDE_API_URL" ] && [ -n "$ZEUDE_AGENT_KEY" ]; then
  curl -s -X POST "${ZEUDE_API_URL}/api/prompts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \
    -d "$PAYLOAD" >> "$HOME/.zeude/logs/prompt-hook.log" 2>&1 &
fi

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": "", "ZEUDE_USER_EMAIL": "", "ZEUDE_TEAM": ""}'::jsonb,
  'active'
);

-- ============================================================================
-- 3. Skill Tracker Hook (PostToolUse)
-- ============================================================================
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
# Cross-platform: macOS, Linux, Windows (Git Bash)

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r ''.session_id // empty'')
TOOL_NAME=$(echo "$INPUT" | jq -r ''.tool // empty'' | head -n1)

TEMP_FILE="$HOME/.zeude/tmp/prompt_${SESSION_ID}.id"
if [ ! -f "$TEMP_FILE" ]; then
  exit 0
fi

PROMPT_ID=$(cat "$TEMP_FILE")
if [ -z "$PROMPT_ID" ]; then
  rm -f "$TEMP_FILE"
  exit 0
fi

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

PROMPT_TYPE="skill"
TOOL_NAME_CLEAN="$TOOL_NAME"

if [[ "$TOOL_NAME" == "Skill" ]]; then
  SKILL_NAME=$(echo "$INPUT" | jq -r ''.tool_input.skill // empty'')
  if [ -z "$SKILL_NAME" ]; then
    exit 0
  fi
  PROMPT_TYPE="skill"
  TOOL_NAME_CLEAN="$SKILL_NAME"
elif [[ "$TOOL_NAME" == "/"* ]]; then
  TOOL_NAME_CLEAN=$(echo "$TOOL_NAME" | sed ''s/^\\///'')
  BUILTIN_COMMANDS=''help clear compact config cost doctor init login logout memory model permissions review status tasks vim''
  if echo "$BUILTIN_COMMANDS" | grep -qw "$TOOL_NAME_CLEAN"; then
    PROMPT_TYPE="command"
  elif [[ "$TOOL_NAME_CLEAN" == *":"* ]]; then
    PROMPT_TYPE="skill"
  else
    PROMPT_TYPE="skill"
  fi
elif [[ "$TOOL_NAME" == "mcp__"* ]]; then
  PROMPT_TYPE="mcp_tool"
  TOOL_NAME_CLEAN="$TOOL_NAME"
else
  rm -f "$TEMP_FILE"
  exit 0
fi

if [ "$PROMPT_TYPE" != "natural" ]; then
  TOOL_NAME_ESCAPED=$(echo "$TOOL_NAME_CLEAN" | jq -Rs ''.'')
  PATCH_DATA="{\"prompt_type\":\"$PROMPT_TYPE\",\"invoked_name\":$TOOL_NAME_ESCAPED}"

  if [ -n "$ZEUDE_API_URL" ] && [ -n "$ZEUDE_AGENT_KEY" ]; then
    curl -s -X PATCH "${ZEUDE_API_URL}/api/prompts/${PROMPT_ID}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \
      -d "$PATCH_DATA" >> "$HOME/.zeude/logs/prompt-hook.log" 2>&1
  fi
fi

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": ""}'::jsonb,
  'active'
);
```

---

## Migration 2: Skill Suggester

> LLM 기반 스킬 자동 추천 (서버 프록시 방식)

**변경사항**: OpenRouter 직접 호출 → Zeude API 프록시
- 로컬에 API 키 노출 없음
- 서버에서 OPENROUTER_API_KEY 관리

```sql
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
  'Skill Suggester',
  'UserPromptSubmit',
  'Analyzes prompts and suggests matching skills via server proxy. Auto-executes on high confidence single match.',
  E'#!/bin/bash
# Skill Suggester Hook - Suggests skills based on prompt analysis
# Uses Zeude API proxy for LLM analysis (no local API key needed)
# Cross-platform: macOS, Linux, Windows (Git Bash)
#
# Behavior:
# - confidence >= 0.7 & 1 match: Auto-prepend skill command
# - confidence >= 0.7 & 2-4 matches: Output suggestion for Claude to present
# - confidence < 0.7 or 0 matches: Pass through unchanged

INPUT=$(cat)
PROMPT_TEXT=$(echo "$INPUT" | jq -r ''.prompt // empty'')

if [ -z "$PROMPT_TEXT" ] || [[ "$PROMPT_TEXT" == /* ]]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

if [ ${#PROMPT_TEXT} -lt 5 ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

# Check for Zeude API configuration
if [ -z "$ZEUDE_API_URL" ] || [ -z "$ZEUDE_AGENT_KEY" ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

# ============================================================================
# Skill Discovery
# ============================================================================

SKILLS_CACHE="$HOME/.zeude/cache/skills.json"
SKILLS_CACHE_TTL=300

get_skills() {
  local skills=""

  if [ -d "$HOME/.claude/commands" ]; then
    for f in "$HOME/.claude/commands"/*.md; do
      [ -f "$f" ] || continue
      local name=$(basename "$f" .md)
      local desc=$(grep -m1 "^description:" "$f" 2>/dev/null | sed ''s/description:[[:space:]]*//'' | head -c 100)
      [ -n "$desc" ] || desc="User command"
      skills="$skills{\"name\":\"$name\",\"desc\":\"$desc\"},"
    done
  fi

  skills="$skills{\"name\":\"clarify\",\"desc\":\"Clarify and refine ambiguous requirements through iterative questioning\"},"
  skills="$skills{\"name\":\"commit\",\"desc\":\"Create a git commit with proper message format\"},"
  skills="$skills{\"name\":\"review-pr\",\"desc\":\"Review a pull request for code quality and issues\"},"
  skills="$skills{\"name\":\"handoff\",\"desc\":\"Create a context handoff document for conversation continuity\"},"
  skills="$skills{\"name\":\"gha\",\"desc\":\"Analyze GitHub Actions workflow failures\"},"

  skills=$(echo "$skills" | sed ''s/,$//'' )
  echo "[$skills]"
}

# Cross-platform file age check
get_file_age() {
  local file="$1"
  local now=$(date +%s)
  local mtime
  mtime=$(stat -f %m "$file" 2>/dev/null) || \
  mtime=$(stat -c %Y "$file" 2>/dev/null) || \
  mtime=0
  echo $((now - mtime))
}

use_cache=false
if [ -f "$SKILLS_CACHE" ]; then
  cache_age=$(get_file_age "$SKILLS_CACHE")
  if [ "$cache_age" -lt "$SKILLS_CACHE_TTL" ]; then
    use_cache=true
  fi
fi

if [ "$use_cache" = true ]; then
  SKILLS_JSON=$(cat "$SKILLS_CACHE")
else
  mkdir -p "$HOME/.zeude/cache"
  SKILLS_JSON=$(get_skills)
  echo "$SKILLS_JSON" > "$SKILLS_CACHE"
fi

# ============================================================================
# LLM Analysis via Zeude API Proxy
# ============================================================================

PROMPT_ESCAPED=$(echo "$PROMPT_TEXT" | jq -Rs ''.'')

API_PAYLOAD=$(cat <<EOFPAYLOAD
{
  "prompt": $PROMPT_ESCAPED,
  "skills": $SKILLS_JSON
}
EOFPAYLOAD
)

# Call Zeude API proxy (server handles OpenRouter)
RESPONSE=$(curl -s --max-time 5 "${ZEUDE_API_URL}/api/skill-suggest" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \\
  -d "$API_PAYLOAD" 2>/dev/null)

MATCHES_JSON=$(echo "$RESPONSE" | jq -r ''.matches // empty'' 2>/dev/null)

if [ -z "$MATCHES_JSON" ] || [ "$MATCHES_JSON" = "null" ] || [ "$MATCHES_JSON" = "[]" ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

MATCH_COUNT=$(echo "$MATCHES_JSON" | jq ''length'' 2>/dev/null || echo 0)

if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "$PROMPT_TEXT"
  exit 0
fi

if [ "$MATCH_COUNT" -eq 1 ]; then
  SKILL_NAME=$(echo "$MATCHES_JSON" | jq -r ''.[0].skill'')
  CONFIDENCE=$(echo "$MATCHES_JSON" | jq -r ''.[0].confidence'')

  echo "/$SKILL_NAME $PROMPT_TEXT"

  curl -s -X POST "${ZEUDE_API_URL}/api/skill-suggestions" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $ZEUDE_AGENT_KEY" \\
    -d "{\"prompt\":$PROMPT_ESCAPED,\"suggested_skill\":\"$SKILL_NAME\",\"confidence\":$CONFIDENCE,\"auto_executed\":true}" \\
    >> "$HOME/.zeude/logs/skill-suggester.log" 2>&1 &
  exit 0
fi

SUGGESTIONS=""
for i in $(seq 0 $((MATCH_COUNT > 4 ? 3 : MATCH_COUNT - 1))); do
  SKILL=$(echo "$MATCHES_JSON" | jq -r ".[$i].skill")
  CONF=$(echo "$MATCHES_JSON" | jq -r ".[$i].confidence")
  SUGGESTIONS="$SUGGESTIONS- /$SKILL (confidence: $CONF)\\n"
done

cat <<EOF
$PROMPT_TEXT

---
[Skill Suggester] 이 프롬프트와 관련된 스킬이 감지되었습니다:
$SUGGESTIONS
사용자에게 스킬 선택을 제안해주세요. 마지막 옵션은 "스킬 사용하지 않기"를 포함해주세요.
---
EOF

exit 0',
  'bash',
  true,
  '{}',
  '{"ZEUDE_API_URL": "", "ZEUDE_AGENT_KEY": ""}'::jsonb,
  'active'
);
```

---

## ClickHouse 테이블 (이미 생성됨)

> 아래 테이블은 이미 ClickHouse에 생성되어 있습니다.

### ai_prompts (ReplacingMergeTree)

```sql
-- 이미 마이그레이션 완료
ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (prompt_id)
```

### skill_suggestions

```sql
-- 이미 생성 완료
CREATE TABLE zeude.skill_suggestions
(
    user_id String,
    user_email LowCardinality(String),
    team LowCardinality(String),
    timestamp DateTime64(3),
    prompt_text String,
    suggested_skill LowCardinality(String),
    confidence Float32,
    auto_executed Bool,
    selected_skill LowCardinality(String) DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (user_id, timestamp)
TTL toDateTime(timestamp) + toIntervalDay(90);
```

---

## 크로스 플랫폼 호환성

| 기능 | macOS | Linux | Windows (Git Bash) |
|------|:-----:|:-----:|:------------------:|
| UUID 생성 | ✅ `uuidgen` | ✅ `/proc` 또는 `uuidgen` | ✅ PowerShell 또는 bash fallback |
| 파일 수정 시간 | ✅ `stat -f %m` | ✅ `stat -c %Y` | ✅ `stat -c %Y` |
| JSON 파싱 | ⚠️ `jq` 필요 | ⚠️ `jq` 필요 | ⚠️ `jq` 필요 |
| HTTP 요청 | ✅ `curl` | ✅ `curl` | ✅ `curl` |

### 의존성

- **jq**: 모든 플랫폼에서 필요
  - macOS: `brew install jq`
  - Linux: `apt install jq` / `yum install jq`
  - Windows: `choco install jq` 또는 [GitHub Releases](https://github.com/stedolan/jq/releases)

---

## Dashboard API 배포 필요

> 훅이 호출하는 API 엔드포인트

| 엔드포인트 | 용도 |
|------------|------|
| `POST /api/prompts` | 프롬프트 로깅 |
| `PATCH /api/prompts/[id]` | 스킬 타입 업데이트 |
| `POST /api/skill-suggest` | LLM 프록시 (OpenRouter) |
| `POST /api/skill-suggestions` | 스킬 제안 로깅 |

**서버 환경변수 필요**: `OPENROUTER_API_KEY` (skill-suggest 프록시용)

---

## Migration 3: HTTP MCP 타입 지원

> MCP 서버에 HTTP 타입 지원 추가 (mcp-hub 게이트웨이 연동)

```sql
-- ============================================================================
-- 1. type 컬럼 추가 (기본값: subprocess)
-- ============================================================================
ALTER TABLE zeude_mcp_servers
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'subprocess';

-- ============================================================================
-- 2. url 컬럼 추가 (HTTP 타입 전용)
-- ============================================================================
ALTER TABLE zeude_mcp_servers
  ADD COLUMN IF NOT EXISTS url text;

-- ============================================================================
-- 3. HTTP 타입은 command 필수가 아니므로 기존 NOT NULL 제약 변경
-- ============================================================================
ALTER TABLE zeude_mcp_servers
  ALTER COLUMN command SET DEFAULT '';

-- ============================================================================
-- 4. 타입 유효성 검사 (subprocess 또는 http만 허용)
-- ============================================================================
ALTER TABLE zeude_mcp_servers
  ADD CONSTRAINT zeude_mcp_servers_type_check
  CHECK (type IN ('subprocess', 'http'));

-- ============================================================================
-- 5. HTTP 타입이면 url 필수
-- ============================================================================
ALTER TABLE zeude_mcp_servers
  ADD CONSTRAINT zeude_mcp_servers_http_url_check
  CHECK (type != 'http' OR url IS NOT NULL);
```

---

## 실행 순서

1. Supabase SQL Editor에서 **Migration 1** 실행
2. Supabase SQL Editor에서 **Migration 2** 실행
3. Supabase SQL Editor에서 **Migration 3** 실행
4. 사용자가 `zeude sync` 실행하여 동기화
