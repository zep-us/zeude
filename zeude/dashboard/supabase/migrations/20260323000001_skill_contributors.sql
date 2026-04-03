-- Add contributors column to zeude_skills
-- Stores array of user UUIDs who contributed to the skill
ALTER TABLE zeude_skills
  ADD COLUMN contributors UUID[] NOT NULL DEFAULT '{}';
