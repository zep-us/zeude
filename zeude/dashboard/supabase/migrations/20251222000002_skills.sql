-- Skills Management Table
-- Stores reusable Claude Code skills (prompts/workflows) that can be assigned to teams

CREATE TABLE zeude_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- /skill-name format for CLI invocation
  description TEXT,
  content TEXT NOT NULL,       -- Markdown content of the skill
  teams TEXT[] NOT NULL DEFAULT '{}',
  is_global BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES zeude_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_skills_teams ON zeude_skills USING GIN (teams);
CREATE INDEX idx_skills_status ON zeude_skills (status);
CREATE INDEX idx_skills_slug ON zeude_skills (slug);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_skills_updated_at
  BEFORE UPDATE ON zeude_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_skills_updated_at();

-- Enable RLS
ALTER TABLE zeude_skills ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (admin API calls)
CREATE POLICY "Service role can manage skills" ON zeude_skills
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read skills they have access to (global or team match)
CREATE POLICY "Users can read accessible skills" ON zeude_skills
  FOR SELECT
  TO authenticated
  USING (
    is_global = true
    OR EXISTS (
      SELECT 1 FROM zeude_users u
      WHERE u.id = auth.uid()
      AND u.team = ANY(zeude_skills.teams)
    )
  );
