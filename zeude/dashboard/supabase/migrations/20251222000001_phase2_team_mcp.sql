-- Phase 2.2: Team Management & MCP Central Control
-- Adds: team/role to users, invite system, MCP servers

-- 1. Extend zeude_users with team management fields
ALTER TABLE zeude_users
ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'default',
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES zeude_users(id);

-- Add constraints for role and status
ALTER TABLE zeude_users
ADD CONSTRAINT zeude_users_role_check CHECK (role IN ('admin', 'member')),
ADD CONSTRAINT zeude_users_status_check CHECK (status IN ('active', 'inactive'));

-- Index for team-based queries
CREATE INDEX IF NOT EXISTS idx_zeude_users_team ON zeude_users(team);
CREATE INDEX IF NOT EXISTS idx_zeude_users_status ON zeude_users(status);

-- 2. Invite links table
CREATE TABLE IF NOT EXISTS zeude_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  team TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_by UUID REFERENCES zeude_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES zeude_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zeude_invites_token ON zeude_invites(token);
CREATE INDEX IF NOT EXISTS idx_zeude_invites_expires ON zeude_invites(expires_at);

-- RLS for invites
ALTER TABLE zeude_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on zeude_invites" ON zeude_invites
  FOR ALL USING (auth.role() = 'service_role');

-- 3. MCP servers table
CREATE TABLE IF NOT EXISTS zeude_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '[]',
  env JSONB DEFAULT '{}',
  teams TEXT[] NOT NULL DEFAULT '{}',
  is_global BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES zeude_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zeude_mcp_servers_teams ON zeude_mcp_servers USING GIN(teams);
CREATE INDEX IF NOT EXISTS idx_zeude_mcp_servers_status ON zeude_mcp_servers(status);
CREATE INDEX IF NOT EXISTS idx_zeude_mcp_servers_global ON zeude_mcp_servers(is_global) WHERE is_global = true;

-- RLS for MCP servers
ALTER TABLE zeude_mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on zeude_mcp_servers" ON zeude_mcp_servers
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Cleanup function update - include expired invites
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM zeude_one_time_tokens WHERE expires_at < NOW();
  DELETE FROM zeude_sessions WHERE expires_at < NOW();
  -- Clean up expired unused invites (keep used ones for audit)
  DELETE FROM zeude_invites WHERE expires_at < NOW() AND used_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
