-- Fix retry_analysis and context_growth_analysis views
-- Previously these views used 'otel_logs' table which doesn't exist
-- Update to use 'claude_code_logs' with LogAttributes extraction

-- Drop old views
DROP VIEW IF EXISTS retry_analysis;
DROP VIEW IF EXISTS context_growth_analysis;

-- Recreate retry_analysis view using claude_code_logs
CREATE VIEW IF NOT EXISTS retry_analysis AS
SELECT
    user_id,
    session_id,
    toDate(timestamp) as date,
    count() as total_requests,

    -- Heuristic: requests within 30 seconds of previous, where previous was short
    -- Likely indicates a retry or correction
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
        LogAttributes['user.id'] as user_id,
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
GROUP BY user_id, session_id, date;


-- Recreate context_growth_analysis view using claude_code_logs
CREATE VIEW IF NOT EXISTS context_growth_analysis AS
SELECT
    user_id,
    session_id,
    toDate(min(timestamp)) as date,

    -- First and last input token counts
    argMin(input_tokens, timestamp) as first_input,
    argMax(input_tokens, timestamp) as last_input,

    -- Growth rate (how much context grew from start to end)
    if(argMin(input_tokens, timestamp) > 0,
        argMax(input_tokens, timestamp) / argMin(input_tokens, timestamp),
        1.0  -- Default to 1.0 (no growth) if no data
    ) as growth_rate,

    count() as session_length,
    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output

FROM (
    SELECT
        LogAttributes['user.id'] as user_id,
        LogAttributes['session.id'] as session_id,
        Timestamp as timestamp,
        toInt64OrZero(LogAttributes['input_tokens']) as input_tokens,
        toInt64OrZero(LogAttributes['output_tokens']) as output_tokens
    FROM claude_code_logs
    WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0
       OR toInt64OrZero(LogAttributes['output_tokens']) > 0
)
WHERE user_id != ''
GROUP BY user_id, session_id;
