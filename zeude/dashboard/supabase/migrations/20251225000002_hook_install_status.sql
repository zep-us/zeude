-- Hook Installation Status Table
-- Tracks which hooks are installed on each user's machine

CREATE TABLE zeude_hook_install_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES zeude_users(id) ON DELETE CASCADE,
  hook_id UUID NOT NULL REFERENCES zeude_hooks(id) ON DELETE CASCADE,
  installed BOOLEAN NOT NULL DEFAULT false,
  version TEXT,  -- Installed version/hash
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hook_id)
);

-- Indexes
CREATE INDEX idx_hook_install_user ON zeude_hook_install_status (user_id);
CREATE INDEX idx_hook_install_hook ON zeude_hook_install_status (hook_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_hook_install_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hook_install_status_updated_at
  BEFORE UPDATE ON zeude_hook_install_status
  FOR EACH ROW
  EXECUTE FUNCTION update_hook_install_status_updated_at();

-- Enable RLS
ALTER TABLE zeude_hook_install_status ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (admin API calls)
CREATE POLICY "Service role can manage hook install status" ON zeude_hook_install_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
