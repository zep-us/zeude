-- Migration: Add user_id column to ai_prompts table
-- This enables proper identification of Bedrock users who don't have email

-- Add user_id column (will be empty for existing records)
ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS user_id String AFTER session_id;

-- Add index for user_id queries
ALTER TABLE ai_prompts ADD INDEX IF NOT EXISTS idx_user_id_time (user_id, timestamp) TYPE minmax GRANULARITY 1;
