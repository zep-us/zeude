-- Migration: Fix token_usage_hourly MV to properly handle user_email
-- Problem: ORDER BY includes user_email, causing same user to split into multiple rows
-- when email is sometimes empty (Bedrock users)
-- Solution: Remove user_email from ORDER BY & GROUP BY, use anyIf() to prefer non-empty email

-- Step 1: Drop old MV
DROP VIEW IF EXISTS token_usage_hourly;

-- Step 2: Create new MV with fixed schema
-- - ORDER BY no longer includes user_email (grouped by user_id instead)
-- - user_email uses anyIf() to prefer non-empty values
CREATE MATERIALIZED VIEW token_usage_hourly
ENGINE = SummingMergeTree()
ORDER BY (org_id, user_id, model_id, mcp_server, hour)
TTL toDateTime(hour) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192
AS SELECT
    LogAttributes['organization.id'] as org_id,
    LogAttributes['user.id'] as user_id,
    anyIf(LogAttributes['user.email'], LogAttributes['user.email'] != '') as user_email,
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
GROUP BY org_id, user_id, model_id, mcp_server, hour;

-- Step 3: Backfill historical data
INSERT INTO token_usage_hourly
SELECT
    LogAttributes['organization.id'] as org_id,
    LogAttributes['user.id'] as user_id,
    anyIf(LogAttributes['user.email'], LogAttributes['user.email'] != '') as user_email,
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
GROUP BY org_id, user_id, model_id, mcp_server, hour;
