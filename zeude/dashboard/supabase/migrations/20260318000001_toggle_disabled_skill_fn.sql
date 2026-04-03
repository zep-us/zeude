-- Atomic function to toggle a skill in user's disabled_skills array.
-- Avoids read-then-write race condition in the application layer.
CREATE OR REPLACE FUNCTION toggle_disabled_skill(
  p_user_id UUID,
  p_slug TEXT,
  p_disabled BOOLEAN
) RETURNS TEXT[] AS $$
DECLARE
  result TEXT[];
BEGIN
  -- Authorization: only allow users to modify their own settings,
  -- or service_role to modify any user's settings.
  IF current_setting('role') != 'service_role' AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot modify another user''s disabled skills';
  END IF;

  IF p_disabled THEN
    -- Add slug (array_append after array_remove to avoid duplicates)
    UPDATE zeude_users
    SET disabled_skills = array_append(array_remove(disabled_skills, p_slug), p_slug),
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING disabled_skills INTO result;
  ELSE
    -- Remove slug
    UPDATE zeude_users
    SET disabled_skills = array_remove(disabled_skills, p_slug),
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING disabled_skills INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Restrict execution to authenticated users only (prevent anon/public abuse)
REVOKE EXECUTE ON FUNCTION toggle_disabled_skill(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toggle_disabled_skill(UUID, TEXT, BOOLEAN) TO authenticated;
