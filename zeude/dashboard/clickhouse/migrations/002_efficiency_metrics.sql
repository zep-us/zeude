-- Efficiency metrics daily view
-- Calculates cache hit rate, average input per request, and other efficiency metrics

CREATE VIEW IF NOT EXISTS efficiency_metrics_daily AS
SELECT
    user_id,
    toDate(hour) as date,

    -- Basic usage
    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output,
    sum(request_count) as total_requests,
    sum(cache_read_tokens) as total_cache_read,
    sum(cache_creation_tokens) as total_cache_creation,

    -- Efficiency metrics
    -- Cache hit rate = cache_read / (input + cache_read)
    -- Note: input_tokens are NEW tokens, cache_read_tokens are CACHED tokens
    -- Total tokens processed = input_tokens + cache_read_tokens
    if(sum(input_tokens) + sum(cache_read_tokens) > 0,
        sum(cache_read_tokens) / (sum(input_tokens) + sum(cache_read_tokens)),
        0
    ) as cache_hit_rate,

    if(sum(request_count) > 0,
        sum(input_tokens) / sum(request_count),
        0
    ) as avg_input_per_request,

    if(sum(request_count) > 0,
        sum(output_tokens) / sum(request_count),
        0
    ) as avg_output_per_request,

    if(sum(request_count) > 0,
        sum(total_duration_ms) / sum(request_count),
        0
    ) as avg_duration_ms

FROM token_usage_hourly
GROUP BY user_id, date;
