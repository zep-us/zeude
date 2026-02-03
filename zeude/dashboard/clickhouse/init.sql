-- ================================================
-- Zeude ClickHouse Schema - Final DDL
-- Generated from migrations 001-009
-- ================================================

-- ================================================
-- 0. Claude Code Logs Table (OTEL Standard Schema)
-- Created by otel-collector, but defined here for fresh init
-- ================================================
CREATE TABLE IF NOT EXISTS claude_code_logs (
    Timestamp DateTime64(9) CODEC(Delta, ZSTD(1)),
    TimestampDate Date DEFAULT toDate(Timestamp),
    TimestampTime DateTime DEFAULT toDateTime(Timestamp),
    TraceId String CODEC(ZSTD(1)),
    SpanId String CODEC(ZSTD(1)),
    TraceFlags UInt32 CODEC(ZSTD(1)),
    SeverityText LowCardinality(String) CODEC(ZSTD(1)),
    SeverityNumber Int32 CODEC(ZSTD(1)),
    ServiceName LowCardinality(String) CODEC(ZSTD(1)),
    Body String CODEC(ZSTD(1)),
    ResourceSchemaUrl String CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeSchemaUrl String CODEC(ZSTD(1)),
    ScopeName String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    LogAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),

    INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_body Body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, TimestampTime)
TTL TimestampTime + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;


-- ================================================
-- 1. AI Prompts Table
-- Stores all user prompts from Claude Code for analytics
-- ================================================
CREATE TABLE IF NOT EXISTS ai_prompts (
    prompt_id UUID DEFAULT generateUUIDv4(),
    session_id String,
    user_id String,
    user_email LowCardinality(String),
    team LowCardinality(String),

    timestamp DateTime64(3),
    prompt_text String,
    prompt_length UInt32,

    -- Prompt type tracking
    prompt_type LowCardinality(String) DEFAULT 'natural',  -- 'natural', 'skill', 'command', 'agent'
    invoked_name String DEFAULT '',

    -- Context
    project_path String,
    working_directory String,

    -- Indexes
    INDEX idx_user_id_time (user_id, timestamp) TYPE minmax GRANULARITY 1,
    INDEX idx_user_email_time (user_email, timestamp) TYPE minmax GRANULARITY 1,
    INDEX idx_team (team) TYPE bloom_filter GRANULARITY 1,
    INDEX idx_prompt_text (prompt_text) TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 1,
    INDEX idx_prompt_type (prompt_type) TYPE bloom_filter GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (user_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY;


-- ================================================
-- 2. Pricing Model Table
-- Model-specific pricing (per million tokens)
-- ================================================
CREATE TABLE IF NOT EXISTS pricing_model (
    model_id String,
    effective_date Date,
    input_price_per_million Float64,
    output_price_per_million Float64,
    cache_read_price_per_million Float64,
    cache_creation_price_per_million Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (model_id, effective_date);

-- Initial pricing data (idempotent - truncate first)
TRUNCATE TABLE IF EXISTS pricing_model;
INSERT INTO pricing_model VALUES
    ('claude-3-5-sonnet-20241022', '2024-10-22', 3.00, 15.00, 0.30, 3.75),
    ('claude-sonnet-4-20250514', '2025-05-14', 3.00, 15.00, 0.30, 3.75),
    ('claude-3-5-haiku-20241022', '2024-10-22', 0.80, 4.00, 0.08, 1.00),
    ('claude-3-opus-20240229', '2024-02-29', 15.00, 75.00, 1.50, 18.75),
    ('claude-opus-4-20250514', '2025-05-14', 15.00, 75.00, 1.50, 18.75),
    ('claude-opus-4-5-20251101', '2025-11-01', 15.00, 75.00, 1.50, 18.75);


-- ================================================
-- 3. Token Usage Hourly (Materialized View)
-- Aggregates token usage from claude_code_logs
-- ================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS token_usage_hourly
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


-- ================================================
-- 4. Efficiency Metrics Daily (View)
-- Cache hit rate, average input per request
-- ================================================
CREATE VIEW IF NOT EXISTS efficiency_metrics_daily AS
SELECT
    user_id,
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
GROUP BY user_id, date;


-- ================================================
-- 5. Retry Analysis (View)
-- Identifies potential retries based on timing patterns
-- ================================================
CREATE VIEW IF NOT EXISTS retry_analysis AS
SELECT
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


-- ================================================
-- 6. Context Growth Analysis (View)
-- Tracks input token growth within sessions
-- ================================================
CREATE VIEW IF NOT EXISTS context_growth_analysis AS
SELECT
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


-- ================================================
-- 7. Frustration Analysis (View)
-- Detects user frustration via keyword patterns
-- ================================================
CREATE VIEW IF NOT EXISTS frustration_analysis AS
SELECT
    user_id,
    session_id,
    toDate(timestamp) as date,
    count() as total_requests,
    sum(frustration_weight) as frustration_score,
    if(count() > 0, sum(frustration_weight) / count(), 0) as frustration_density
FROM (
    SELECT
        user_id,
        session_id,
        timestamp,
        prompt_text,
        prompt_length,
        CASE
            WHEN prompt_length > 150 THEN 0.0
            WHEN match(lower(prompt_text), '(create|generate|make|build|write|implement)')
            THEN 0.0
            WHEN match(prompt_text, '^(아니|아냐|잠깐|잠만|틀렸|잘못|그게 아니)')
                 OR match(lower(prompt_text), '^(no[, ]|nope|wrong|wait|stop|actually|incorrect)')
            THEN 1.0
            WHEN match(prompt_text, '(다시 해|다시해|여전히|또 |계속 안|재시도)')
                 OR match(lower(prompt_text), '(try again|do.?again|still (not|doesn|fail)|retry|redo)')
            THEN 0.8
            WHEN prompt_length < 60 AND (
                match(prompt_text, '(안돼|안되|에러|오류|고쳐|수정해|실패|버그)')
                OR match(lower(prompt_text), '(error|fail|fix|broken|bug|doesn.t work)')
            )
            THEN 0.6
            WHEN prompt_length < 80 AND match(prompt_text, '(왜 안|뭐가 문제|이상한데|뭐지)')
            THEN 0.4
            ELSE 0.0
        END as frustration_weight
    FROM ai_prompts
    WHERE prompt_text != ''
      AND length(prompt_text) < 2000
)
WHERE user_id != ''
GROUP BY user_id, session_id, date;
