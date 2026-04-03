-- Cohort membership table for scoped leaderboard tracking (e.g. hackathon)

CREATE TABLE IF NOT EXISTS zeude_cohort_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES zeude_users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES zeude_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_zeude_cohort_members_cohort_key ON zeude_cohort_members(cohort_key);
CREATE INDEX IF NOT EXISTS idx_zeude_cohort_members_user_id ON zeude_cohort_members(user_id);

ALTER TABLE zeude_cohort_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zeude_cohort_members'
      AND policyname = 'Service role full access on zeude_cohort_members'
  ) THEN
    CREATE POLICY "Service role full access on zeude_cohort_members"
      ON zeude_cohort_members
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END
$$;
