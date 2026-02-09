-- AI Prompts Table
-- Stores all user prompts from Claude Code for analytics and AI coaching
-- Data is inserted via the prompt-logger hook on UserPromptSubmit event
--
-- NOTE: This table uses MergeTree() (not ReplacingMergeTree).
-- The PATCH endpoint at /api/prompts/[id] inserts duplicate rows for updates.
-- All monitoring queries MUST deduplicate by prompt_id using argMax(field, timestamp).

CREATE TABLE IF NOT EXISTS ai_prompts (
    prompt_id UUID DEFAULT generateUUIDv4(),
    session_id String,
    user_id String,  -- Primary identifier (works for all auth methods including Bedrock)
    user_email LowCardinality(String),  -- May be empty for Bedrock users
    team LowCardinality(String),

    timestamp DateTime64(3),
    prompt_text String,
    prompt_length UInt32,

    -- Prompt type tracking (added in migration 007)
    -- Tracks whether user invoked a skill/command/agent vs natural language
    prompt_type LowCardinality(String) DEFAULT 'natural',  -- 'natural', 'skill', 'command', 'agent'
    invoked_name String DEFAULT '',  -- Skill slug, command name, or agent name

    -- Context
    project_path String,
    working_directory String,

    -- Indexing for efficient queries
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
