-- Zeude Dashboard Schema
-- Tables: zeude_users, zeude_one_time_tokens, zeude_sessions

-- Users table
CREATE TABLE IF NOT EXISTS zeude_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  agent_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One-time tokens for authentication
CREATE TABLE IF NOT EXISTS zeude_one_time_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES zeude_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS zeude_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES zeude_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zeude_users_agent_key ON zeude_users(agent_key);
CREATE INDEX IF NOT EXISTS idx_zeude_users_email ON zeude_users(email);
CREATE INDEX IF NOT EXISTS idx_zeude_one_time_tokens_token ON zeude_one_time_tokens(token);
CREATE INDEX IF NOT EXISTS idx_zeude_one_time_tokens_expires ON zeude_one_time_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_zeude_sessions_token ON zeude_sessions(token);
CREATE INDEX IF NOT EXISTS idx_zeude_sessions_user_id ON zeude_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_zeude_sessions_expires ON zeude_sessions(expires_at);

-- RLS (Row Level Security)
ALTER TABLE zeude_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeude_one_time_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeude_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on zeude_users" ON zeude_users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on zeude_one_time_tokens" ON zeude_one_time_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on zeude_sessions" ON zeude_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Cleanup function for expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM zeude_one_time_tokens WHERE expires_at < NOW();
  DELETE FROM zeude_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
