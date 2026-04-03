-- Migration 011: Add source column + pricing_model JOIN for cost_usd
-- (Merged from original 012 + 013 to avoid double backfill of claude_code_logs)
--
-- Changes to token_usage_hourly MV:
--   1. source column: 'codex' for ServiceName containing 'codex', 'claude' for everything else
--   2. user_id: prefers ResourceAttributes['zeude.user.id'] (Supabase UUID) over LogAttributes['user.id']
--   3. cost_usd: computed via pricing_model LEFT JOIN instead of LogAttributes['cost_usd']
--      Falls back to LogAttributes['cost_usd'] when model is not found in pricing_model
--      (LEFT JOIN with conditional fallback via `if()`)
--   4. source added to ORDER BY for per-source aggregation
--
-- Backfill: All existing rows are re-aggregated from claude_code_logs (single pass).
-- Historical data defaults to 'claude' since all pre-migration data is from Claude Code.
--
-- NOTE: During migration, the MV is dropped and recreated. New telemetry arriving
-- between DROP VIEW and backfill completion will be captured by the new MV trigger
-- but NOT by the backfill. To avoid double-counting, apply during low-traffic periods.

-- Step 1: Drop dependent views first (they reference token_usage_hourly)
DROP VIEW IF EXISTS efficiency_metrics_daily;

-- Step 2: Drop old MV (this also drops the backing .inner_id.* table automatically)
DROP VIEW IF EXISTS token_usage_hourly;

-- Step 3: Create new MV with source column and pricing_model JOIN
CREATE MATERIALIZED VIEW token_usage_hourly
ENGINE = SummingMergeTree()
ORDER BY (org_id, user_id, source, model_id, mcp_server, hour)
TTL toDateTime(hour) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192
AS SELECT
    LogAttributes['organization.id'] as org_id,
    if(ResourceAttributes['zeude.user.id'] != '',
       ResourceAttributes['zeude.user.id'],
       LogAttributes['user.id']) as user_id,
    multiIf(
        ServiceName ILIKE '%codex%', 'codex',
        'claude'
    ) as source,
    anyIf(LogAttributes['user.email'], LogAttributes['user.email'] != '') as user_email,
    LogAttributes['model'] as model_id,
    LogAttributes['mcp.server'] as mcp_server,
    toStartOfHour(Timestamp) as hour,
    sum(toInt64OrZero(LogAttributes['input_tokens'])) as input_tokens,
    sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens,
    sum(toInt64OrZero(LogAttributes['cache_read_tokens'])) as cache_read_tokens,
    sum(toInt64OrZero(LogAttributes['cache_creation_tokens'])) as cache_creation_tokens,
    sum(
        if(pm.model_id IS NOT NULL,
            toInt64OrZero(LogAttributes['input_tokens'])
                * pm.input_price / 1000000.0
            + toInt64OrZero(LogAttributes['output_tokens'])
                * pm.output_price / 1000000.0
            + toInt64OrZero(LogAttributes['cache_read_tokens'])
                * pm.cache_read_price / 1000000.0
            + toInt64OrZero(LogAttributes['cache_creation_tokens'])
                * pm.cache_creation_price / 1000000.0,
            toFloat64OrZero(LogAttributes['cost_usd'])
        )
    ) as cost_usd,
    count() as request_count,
    sum(toInt64OrZero(LogAttributes['duration_ms'])) as total_duration_ms
FROM claude_code_logs
LEFT JOIN (
    SELECT
        model_id,
        argMax(input_price_per_million, effective_date) as input_price,
        argMax(output_price_per_million, effective_date) as output_price,
        argMax(cache_read_price_per_million, effective_date) as cache_read_price,
        argMax(cache_creation_price_per_million, effective_date) as cache_creation_price
    FROM pricing_model
    GROUP BY model_id
) pm ON LogAttributes['model'] = pm.model_id
WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0 OR toInt64OrZero(LogAttributes['output_tokens']) > 0
GROUP BY org_id, user_id, source, model_id, mcp_server, hour;

-- Step 4: Backfill historical data (single pass, includes source + pricing JOIN)
INSERT INTO token_usage_hourly
SELECT
    LogAttributes['organization.id'] as org_id,
    if(ResourceAttributes['zeude.user.id'] != '',
       ResourceAttributes['zeude.user.id'],
       LogAttributes['user.id']) as user_id,
    multiIf(
        ServiceName ILIKE '%codex%', 'codex',
        'claude'
    ) as source,
    anyIf(LogAttributes['user.email'], LogAttributes['user.email'] != '') as user_email,
    LogAttributes['model'] as model_id,
    LogAttributes['mcp.server'] as mcp_server,
    toStartOfHour(Timestamp) as hour,
    sum(toInt64OrZero(LogAttributes['input_tokens'])) as input_tokens,
    sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens,
    sum(toInt64OrZero(LogAttributes['cache_read_tokens'])) as cache_read_tokens,
    sum(toInt64OrZero(LogAttributes['cache_creation_tokens'])) as cache_creation_tokens,
    sum(
        if(pm.model_id IS NOT NULL,
            toInt64OrZero(LogAttributes['input_tokens'])
                * pm.input_price / 1000000.0
            + toInt64OrZero(LogAttributes['output_tokens'])
                * pm.output_price / 1000000.0
            + toInt64OrZero(LogAttributes['cache_read_tokens'])
                * pm.cache_read_price / 1000000.0
            + toInt64OrZero(LogAttributes['cache_creation_tokens'])
                * pm.cache_creation_price / 1000000.0,
            toFloat64OrZero(LogAttributes['cost_usd'])
        )
    ) as cost_usd,
    count() as request_count,
    sum(toInt64OrZero(LogAttributes['duration_ms'])) as total_duration_ms
FROM claude_code_logs
LEFT JOIN (
    SELECT
        model_id,
        argMax(input_price_per_million, effective_date) as input_price,
        argMax(output_price_per_million, effective_date) as output_price,
        argMax(cache_read_price_per_million, effective_date) as cache_read_price,
        argMax(cache_creation_price_per_million, effective_date) as cache_creation_price
    FROM pricing_model
    GROUP BY model_id
) pm ON LogAttributes['model'] = pm.model_id
WHERE toInt64OrZero(LogAttributes['input_tokens']) > 0 OR toInt64OrZero(LogAttributes['output_tokens']) > 0
GROUP BY org_id, user_id, source, model_id, mcp_server, hour;

-- Step 5: Recreate efficiency_metrics_daily view with source column
CREATE VIEW IF NOT EXISTS efficiency_metrics_daily AS
SELECT
    user_id,
    source,
    toDate(hour) as date,

    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output,
    sum(request_count) as total_requests,
    sum(cache_read_tokens) as total_cache_read,
    sum(cache_creation_tokens) as total_cache_creation,

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
GROUP BY user_id, source, date;
