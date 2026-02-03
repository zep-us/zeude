-- Add 2-tier keyword system for improved skill hint matching
-- Primary keywords: High-confidence, trigger alone
-- Secondary keywords: Need 2+ matches to trigger

-- Add tier columns
ALTER TABLE zeude_skills
  ADD COLUMN IF NOT EXISTS primary_keywords text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS secondary_keywords text[] DEFAULT '{}';

-- Migrate existing keywords to primary (conservative default)
-- This ensures backward compatibility - all current keywords become high-confidence
UPDATE zeude_skills
SET primary_keywords = keywords
WHERE keywords IS NOT NULL
  AND array_length(keywords, 1) > 0
  AND (primary_keywords IS NULL OR array_length(primary_keywords, 1) = 0);

-- Indexes for efficient array containment queries
CREATE INDEX IF NOT EXISTS idx_skills_primary_keywords
  ON zeude_skills USING GIN (primary_keywords);

CREATE INDEX IF NOT EXISTS idx_skills_secondary_keywords
  ON zeude_skills USING GIN (secondary_keywords);

-- Documentation
COMMENT ON COLUMN zeude_skills.primary_keywords IS
  'High-confidence keywords that trigger skill suggestion alone (e.g., "slack", "prd", "clickhouse")';

COMMENT ON COLUMN zeude_skills.secondary_keywords IS
  'Lower-confidence keywords that need 2+ matches to trigger (e.g., "message", "send", "create")';

-- Update keywords column comment to indicate deprecation path
COMMENT ON COLUMN zeude_skills.keywords IS
  'DEPRECATED: Legacy keyword list. Use primary_keywords and secondary_keywords for 2-tier matching. Kept for backward compatibility.';
