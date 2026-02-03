-- Retry density analysis view
-- Identifies potential retries based on time gaps and short-duration requests

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
        user_id,
        session_id,
        timestamp,
        duration_ms,
        output_tokens,
        dateDiff('second',
            lagInFrame(timestamp) OVER w,
            timestamp
        ) as time_gap,
        lagInFrame(duration_ms) OVER w as prev_duration,
        lagInFrame(output_tokens) OVER w as prev_output_tokens
    FROM otel_logs
    WHERE input_tokens > 0 OR output_tokens > 0
    WINDOW w AS (PARTITION BY session_id ORDER BY timestamp)
)
GROUP BY user_id, session_id, date;
