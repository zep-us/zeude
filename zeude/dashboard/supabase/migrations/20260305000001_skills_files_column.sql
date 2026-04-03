-- Add files JSONB column to zeude_skills table
-- Migration for multi-file skill support (Phase 1a)
-- Split into two migrations per architecture proposal §3.1:
--   This file: ADD COLUMN + data migration + index
--   Next file (_001b): NOT NULL + CHECK constraint (run after confirming UPDATE is complete)

-- Step 1: Add files JSONB column (nullable for safe migration)
ALTER TABLE zeude_skills ADD COLUMN IF NOT EXISTS files JSONB;

-- Step 2: Migrate existing content data to files format
-- Wrap existing content in {"SKILL.md": content} structure
UPDATE zeude_skills
SET files = jsonb_build_object('SKILL.md', content)
WHERE content IS NOT NULL AND files IS NULL;

-- Step 3: Add missing is_global partial index (identified as missing in architecture review)
CREATE INDEX IF NOT EXISTS idx_skills_is_global
  ON zeude_skills (is_global)
  WHERE is_global = true;

-- Note: content column is intentionally retained for backward compatibility.
-- It will be dropped in a future migration after all shims are updated.
-- New multi-file skills set content = NULL (files is the source of truth).
ALTER TABLE zeude_skills ALTER COLUMN content DROP NOT NULL;

-- NOT NULL and CHECK constraints for files are applied in the next migration file.
