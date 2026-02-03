-- Hooks Table
-- Stores hook definitions for Claude Code (UserPromptSubmit, Stop, etc.)

CREATE TABLE zeude_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event TEXT NOT NULL,  -- Claude hook event: UserPromptSubmit, Stop, PreToolUse, PostToolUse
  description TEXT,
  script_content TEXT NOT NULL,
  script_type TEXT NOT NULL DEFAULT 'bash',  -- bash, python, node
  is_global BOOLEAN NOT NULL DEFAULT false,
  teams TEXT[] DEFAULT '{}',
  env JSONB DEFAULT '{}',  -- Environment variables needed by the hook
  status TEXT NOT NULL DEFAULT 'active',  -- active, inactive
  created_by UUID REFERENCES zeude_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_hooks_status ON zeude_hooks (status);
CREATE INDEX idx_hooks_event ON zeude_hooks (event);
CREATE INDEX idx_hooks_is_global ON zeude_hooks (is_global);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_zeude_hooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_zeude_hooks_updated_at
  BEFORE UPDATE ON zeude_hooks
  FOR EACH ROW
  EXECUTE FUNCTION update_zeude_hooks_updated_at();

-- Enable RLS
ALTER TABLE zeude_hooks ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (admin API calls)
CREATE POLICY "Service role can manage hooks" ON zeude_hooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
