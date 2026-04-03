-- Grant service_role permission to execute toggle_disabled_skill.
-- The original migration (20260318000001) only granted to 'authenticated',
-- but the dashboard API uses service_role key, causing "permission denied" 500 errors.
GRANT EXECUTE ON FUNCTION toggle_disabled_skill(UUID, TEXT, BOOLEAN) TO service_role;
