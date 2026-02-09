-- Skill Suggestions Table
-- Logs skill suggestion events from the Skill Suggester hook
-- Data is inserted via POST /api/skill-suggestions when a skill is suggested or auto-executed

CREATE TABLE IF NOT EXISTS skill_suggestions
(
    user_id String,
    user_email LowCardinality(String),
    team LowCardinality(String),
    timestamp DateTime64(3),
    prompt_text String,
    suggested_skill LowCardinality(String),
    confidence Float32,
    auto_executed Bool,
    selected_skill LowCardinality(String) DEFAULT '',
    INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_team team TYPE bloom_filter GRANULARITY 1,
    INDEX idx_skill suggested_skill TYPE bloom_filter GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (user_id, timestamp)
TTL toDateTime(timestamp) + toIntervalDay(90)
SETTINGS index_granularity = 8192;
