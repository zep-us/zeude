-- Context growth analysis view
-- Tracks how input token count grows within a session

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
        0
    ) as growth_rate,

    count() as session_length,
    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output

FROM otel_logs
WHERE input_tokens > 0 OR output_tokens > 0
GROUP BY user_id, session_id;
