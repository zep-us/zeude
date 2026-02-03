-- Migration: Add prompt type tracking for skills, commands, and agents
-- This enables analytics on how users invoke predefined workflows vs natural language

-- Step 1: Add prompt_type column
-- Values: 'natural' (default), 'skill', 'command', 'agent'
ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS prompt_type LowCardinality(String) DEFAULT 'natural';

-- Step 2: Add invoked_name column (stores skill slug, command name, or agent name)
ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS invoked_name String DEFAULT '';

-- Step 3: Add index for efficient prompt type queries
ALTER TABLE ai_prompts ADD INDEX IF NOT EXISTS idx_prompt_type (prompt_type) TYPE bloom_filter GRANULARITY 1;

-- Step 4: Backfill existing prompts - detect /command patterns
-- This will classify prompts that start with / as potential skill/command invocations
-- Note: This is a best-effort classification based on prompt text pattern
ALTER TABLE ai_prompts
UPDATE
    prompt_type = 'skill',
    invoked_name = extractAll(prompt_text, '^/([a-zA-Z0-9_:-]+)')[1]
WHERE prompt_text LIKE '/%'
  AND prompt_type = 'natural'
  AND length(extractAll(prompt_text, '^/([a-zA-Z0-9_:-]+)')) > 0;
