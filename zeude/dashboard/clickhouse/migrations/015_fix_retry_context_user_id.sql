-- Migration 015: Fix user_id SSOT in retry_analysis and context_growth_analysis
-- These views were created in migration 013 using LogAttributes['user.id'] (Claude internal ID),
-- but token_usage_hourly (migration 011) uses ResourceAttributes['zeude.user.id'] (Supabase UUID).
-- This mismatch causes LEFT JOIN failures in the efficiency route.
--
-- Fix: Adopt the same SSOT pattern from migration 011:
--   if(ResourceAttributes['zeude.user.id'] != '', ResourceAttributes['zeude.user.id'], LogAttributes['user.id'])
--
-- Both are regular VIEWs (not MVs), so DROP+CREATE is safe and instant — no data loss.
-- Rollback: Re-run migration 013 to restore the previous view definitions.

-- Drop old views
DROP VIEW IF EXISTS retry_analysis;
DROP VIEW IF EXISTS context_growth_analysis;

-- Recreate retry_analysis with SSOT user_id
CREATE VIEW IF NOT EXISTS retry_analysis AS
SELECT
    multiIf(ServiceName ILIKE '%codex%', 'codex', 'claude') as source,
    user_id,
    session_id,
    toDate(timestamp) as date,
    count() as total_requests,

    countIf(
        time_gap < 30
        AND (prev_duration < 5000 OR prev_output_tokens < 100)
    ) as likely_retries,

    if(count() > 0,
        countIf(
            time_gap < 30
            AND (prev_duration < 5000 OR prev_output_tokens < 100)
        ) / count(),
        0
    ) as retry_density

FROM (
    SELECT
        ServiceName,
        if(ResourceAttributes['zeude.user.id'] != '',
           ResourceAttributes['zeude.user.id'],
           LogAttributes['user.id']) as user_id,
        LogAttributes['session.id'] as session_id,
        Timestamp as timestamp,
        toInt64OrZero(LogAttributes['duration_ms']) as duration_ms,
        toInt64OrZero(LogAttributes['output_tokens']) as output_tokens,
        toInt64OrZero(LogAttributes['input_tokens']) as input_tokens,
        dateDiff('second',
            lagInFrame(Timestamp) OVER w,
            Timestamp
        ) as time_gap,
        lagInFrame(toInt64OrZero(LogAttributes['duration_ms'])) OVER w as prev_duration,
        lagInFrame(toInt64OrZero(LogAttributes['output_tokens'])) OVER w as prev_output_tokens
    FROM claude_code_logs
    WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0
       OR toInt64OrZero(LogAttributes['output_tokens']) > 0
    WINDOW w AS (PARTITION BY LogAttributes['session.id'] ORDER BY Timestamp)
)
WHERE user_id != ''
GROUP BY source, user_id, session_id, date;


-- Recreate context_growth_analysis with SSOT user_id
CREATE VIEW IF NOT EXISTS context_growth_analysis AS
SELECT
    multiIf(ServiceName ILIKE '%codex%', 'codex', 'claude') as source,
    user_id,
    session_id,
    toDate(min(timestamp)) as date,

    argMin(input_tokens, timestamp) as first_input,
    argMax(input_tokens, timestamp) as last_input,

    if(argMin(input_tokens, timestamp) > 0,
        argMax(input_tokens, timestamp) / argMin(input_tokens, timestamp),
        1.0
    ) as growth_rate,

    count() as session_length,
    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output

FROM (
    SELECT
        ServiceName,
        if(ResourceAttributes['zeude.user.id'] != '',
           ResourceAttributes['zeude.user.id'],
           LogAttributes['user.id']) as user_id,
        LogAttributes['session.id'] as session_id,
        Timestamp as timestamp,
        toInt64OrZero(LogAttributes['input_tokens']) as input_tokens,
        toInt64OrZero(LogAttributes['output_tokens']) as output_tokens
    FROM claude_code_logs
    WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0
       OR toInt64OrZero(LogAttributes['output_tokens']) > 0
)
WHERE user_id != ''
GROUP BY source, user_id, session_id;
