-- Migration: Add skill detection to codex_prompts_bridge MV
--
-- Previously, codex_prompts_bridge hardcoded prompt_type='natural' and
-- invoked_name=''. This migration recreates the MV to extract skill names
-- from Codex prompt text using the $skill-name mention syntax.
--
-- Codex uses '$' as the tool mention sigil (TOOL_MENTION_SIGIL in mention_syntax.rs).
-- Skills are invoked via: $my-skill, $plugin:name, [$skill](path)
-- The raw prompt text is logged in the codex.user_prompt OTEL event.
--
-- Detection heuristic:
--   Regex: \$([a-z][a-zA-Z0-9_:-]*)
--   - Requires first char after $ to be lowercase letter
--   - This automatically filters env vars ($PATH, $HOME, $USER, etc.)
--     which are conventionally ALL_UPPERCASE
--   - Captures skill name including namespace colons (plugin:name)
--   - Returns first match (primary skill invocation)

-- ============================================================
-- Step 1: Drop existing codex_prompts_bridge MV
-- ============================================================
DROP VIEW IF EXISTS codex_prompts_bridge;

-- ============================================================
-- Step 2: Recreate with skill detection logic
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

    -- Skill detection from Codex $skill-name syntax
    -- First char lowercase filters env vars (PATH, HOME, etc.)
    if(length(extract(LogAttributes['prompt'], '\\$([a-z][a-zA-Z0-9_:-]*)')) > 0,
       'skill', 'natural') as prompt_type,
    extract(LogAttributes['prompt'], '\\$([a-z][a-zA-Z0-9_:-]*)') as invoked_name,

    'codex' as source,
    LogAttributes['project_path'] as project_path,
    LogAttributes['working_directory'] as working_directory
FROM claude_code_logs
WHERE ServiceName ILIKE '%codex%'
  AND LogAttributes['prompt'] != ''
  AND LogAttributes['prompt'] != '[REDACTED]';
