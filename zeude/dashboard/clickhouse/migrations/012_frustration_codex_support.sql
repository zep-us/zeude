-- Migration: Extend frustration_analysis to process Codex data
-- Adds source column to ai_prompts, creates codex_prompts_bridge MV,
-- and recreates frustration_analysis with source column for unified
-- Korean/English frustration keyword detection across Claude Code and Codex.
--
-- Codex prompts flow: claude_code_logs (ServiceName='codex_cli_rs')
--   → codex_prompts_bridge MV → ai_prompts (source='codex')
-- Claude prompts flow: prompt-logger hook → ai_prompts (source='claude')
--
-- Frustration keyword patterns are applied UNIFORMLY to both sources
-- (no source-based branching per design constraint).

-- ============================================================
-- Step 1: Add source column to ai_prompts
-- Default 'claude' preserves all existing Claude Code data
-- ============================================================
ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS source LowCardinality(String) DEFAULT 'claude';
ALTER TABLE ai_prompts ADD INDEX IF NOT EXISTS idx_source (source) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE ai_prompts MATERIALIZE INDEX idx_source;

-- ============================================================
-- Step 2: Create codex_prompts_bridge MV
-- Routes codex.user_prompt events from OTEL logs into ai_prompts
-- so frustration_analysis can process them with same keyword patterns.
--
-- Codex OTEL schema (from codex-rs SessionTelemetry):
--   LogAttributes['prompt']        → prompt text
--   LogAttributes['prompt_length'] → prompt length (string, needs cast)
--   LogAttributes['conversation.id'] → session/thread ID
--   LogAttributes['user.account_id'] → user identifier
--   LogAttributes['user.email']    → user email
--   ResourceAttributes['zeude.user.id'] → Supabase UUID (injected by shim)
--
-- Filters out [REDACTED] prompts (log_user_prompts=false)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS codex_prompts_bridge
TO ai_prompts
AS SELECT
    generateUUIDv4() as prompt_id,
    LogAttributes['conversation.id'] as session_id,
    if(ResourceAttributes['zeude.user.id'] != '',
       ResourceAttributes['zeude.user.id'],
       LogAttributes['user.account_id']) as user_id,
    LogAttributes['user.email'] as user_email,
    LogAttributes['team'] as team,
    Timestamp as timestamp,
    LogAttributes['prompt'] as prompt_text,
    toUInt32OrZero(LogAttributes['prompt_length']) as prompt_length,
    'natural' as prompt_type,
    '' as invoked_name,
    'codex' as source,
    LogAttributes['project_path'] as project_path,
    LogAttributes['working_directory'] as working_directory
FROM claude_code_logs
WHERE ServiceName ILIKE '%codex%'
  AND LogAttributes['prompt'] != ''
  AND LogAttributes['prompt'] != '[REDACTED]';

-- ============================================================
-- Step 3: Recreate frustration_analysis view with source column
-- Same Korean/English keyword patterns applied uniformly to all sources.
-- Source is exposed for dashboard filtering/comparison but does NOT
-- affect which patterns are applied (no source-based branching).
-- ============================================================
DROP VIEW IF EXISTS frustration_analysis;

CREATE VIEW IF NOT EXISTS frustration_analysis AS
SELECT
    user_id,
    source,
    session_id,
    toDate(timestamp) as date,
    count() as total_requests,
    sum(frustration_weight) as frustration_score,
    if(count() > 0, sum(frustration_weight) / count(), 0) as frustration_density
FROM (
    SELECT
        user_id,
        source,
        session_id,
        timestamp,
        prompt_text,
        prompt_length,
        CASE
            -- FILTER: Long prompts are likely new tasks, not complaints
            WHEN prompt_length > 150 THEN 0.0

            -- FILTER: Explicit new task signals
            WHEN match(lower(prompt_text), '(create|generate|make|build|write|implement)')
            THEN 0.0

            -- HIGH CONFIDENCE (1.0): Direct negation at START of prompt
            -- Korean: "아니", "아냐", "잠깐", "틀렸", "잘못"
            -- English: "no", "wrong", "wait", "stop", "actually"
            WHEN match(prompt_text, '^(아니|아냐|잠깐|잠만|틀렸|잘못|그게 아니)')
                 OR match(lower(prompt_text), '^(no[, ]|nope|wrong|wait|stop|actually|incorrect)')
            THEN 1.0

            -- MEDIUM-HIGH CONFIDENCE (0.8): Repetition/persistence signals
            -- Korean: "다시", "여전히", "또", "계속"
            -- English: "again", "still", "retry", "redo"
            WHEN match(prompt_text, '(다시 해|다시해|여전히|또 |계속 안|재시도)')
                 OR match(lower(prompt_text), '(try again|do.?again|still (not|doesn|fail)|retry|redo)')
            THEN 0.8

            -- MEDIUM CONFIDENCE (0.6): Error/fix signals in SHORT prompts only
            WHEN prompt_length < 60 AND (
                match(prompt_text, '(안돼|안되|에러|오류|고쳐|수정해|실패|버그)')
                OR match(lower(prompt_text), '(error|fail|fix|broken|bug|doesn.t work)')
            )
            THEN 0.6

            -- LOW CONFIDENCE (0.4): Questioning/confusion signals
            WHEN prompt_length < 80 AND match(prompt_text, '(왜 안|뭐가 문제|이상한데|뭐지)')
            THEN 0.4

            ELSE 0.0
        END as frustration_weight
    FROM ai_prompts
    WHERE prompt_text != ''
      AND length(prompt_text) < 2000
)
WHERE user_id != ''
GROUP BY user_id, source, session_id, date;
