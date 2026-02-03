-- ClickHouse table for Claude Code telemetry logs
CREATE TABLE IF NOT EXISTS claude_code_logs (
    timestamp DateTime64(3) DEFAULT now64(3),
    session_id String,
    user_email String,
    user_id String,
    organization_id String,
    event_name String,
    model String DEFAULT '',
    attributes String DEFAULT '{}',
    resource_attributes String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_email, timestamp, session_id)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Index for common queries
ALTER TABLE claude_code_logs ADD INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE claude_code_logs ADD INDEX idx_event_name event_name TYPE set(100) GRANULARITY 1;
