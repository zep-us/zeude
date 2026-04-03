-- Create zeude_agents table (Phase 1b)
-- Agents are AI role profiles installed to ~/.claude/agents/{name}.md

CREATE TABLE zeude_agents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL UNIQUE,
  description        TEXT,
  files              JSONB NOT NULL,
  teams              TEXT[] DEFAULT '{}',
  is_global          BOOLEAN DEFAULT false,
  status             TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by         UUID REFERENCES zeude_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Name validation: lowercase letters and hyphens only (no digits)
-- Regex prevents leading/trailing/consecutive hyphens. Max 64 chars.
ALTER TABLE zeude_agents ADD CONSTRAINT check_agent_name_format
  CHECK (name ~ '^[a-z]+(-[a-z]+)*$' AND length(name) <= 64);

-- Files size constraint: 256KB max per agent
ALTER TABLE zeude_agents ADD CONSTRAINT check_agent_files_size
  CHECK (pg_column_size(files) <= 262144);

-- Row Level Security
ALTER TABLE zeude_agents ENABLE ROW LEVEL SECURITY;

-- Service role (admin API) - full access
CREATE POLICY "Service role can manage agents" ON zeude_agents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users: read own team or global agents only
CREATE POLICY "Users can read accessible agents" ON zeude_agents
  FOR SELECT TO authenticated
  USING (
    is_global = true
    OR EXISTS (
      SELECT 1 FROM zeude_users u
      WHERE u.id = auth.uid()
      AND u.team = ANY(zeude_agents.teams)
    )
  );

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agents_updated_at
  BEFORE UPDATE ON zeude_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_agents_updated_at();

-- Indexes for efficient querying
CREATE INDEX idx_agents_teams ON zeude_agents USING GIN (teams);
CREATE INDEX idx_agents_status ON zeude_agents (status);
CREATE INDEX idx_agents_is_global ON zeude_agents (is_global) WHERE is_global = true;
