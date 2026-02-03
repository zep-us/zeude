-- Token usage hourly aggregation materialized view
-- Aggregates token usage from claude_code_logs for efficient querying
-- TTL: Data is automatically deleted after 90 days

CREATE MATERIALIZED VIEW IF NOT EXISTS token_usage_hourly
ENGINE = SummingMergeTree()
ORDER BY (org_id, user_id, user_email, model_id, mcp_server, hour)
TTL toDateTime(hour) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192
AS SELECT
    LogAttributes['organization.id'] as org_id,
    LogAttributes['user.id'] as user_id,
    LogAttributes['user.email'] as user_email,
    LogAttributes['model'] as model_id,
    LogAttributes['mcp.server'] as mcp_server,
    toStartOfHour(Timestamp) as hour,
    sum(toInt64OrZero(LogAttributes['input_tokens'])) as input_tokens,
    sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens,
    sum(toInt64OrZero(LogAttributes['cache_read_tokens'])) as cache_read_tokens,
    sum(toInt64OrZero(LogAttributes['cache_creation_tokens'])) as cache_creation_tokens,
    sum(toFloat64OrZero(LogAttributes['cost_usd'])) as cost_usd,
    count() as request_count,
    sum(toInt64OrZero(LogAttributes['duration_ms'])) as total_duration_ms
FROM claude_code_logs
WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0 OR toInt64OrZero(LogAttributes['output_tokens']) > 0
GROUP BY org_id, user_id, user_email, model_id, mcp_server, hour;
