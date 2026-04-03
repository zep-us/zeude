-- Add disabled_skills column to zeude_users
-- Stores an array of skill slugs that the user has opted out of syncing to their local machine.
-- The CLI config endpoint filters out these skills before returning the user's config.
ALTER TABLE zeude_users ADD COLUMN disabled_skills TEXT[] NOT NULL DEFAULT '{}';

-- GIN index for efficient array containment queries (e.g. @>, <@, &&)
CREATE INDEX idx_users_disabled_skills ON zeude_users USING GIN (disabled_skills);

COMMENT ON COLUMN zeude_users.disabled_skills IS 'List of skill slugs the user has opted out of. Skills in this list are excluded from the /api/config response so they are not synced to the user''s local machine.';
