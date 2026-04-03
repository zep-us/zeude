-- Soft delete: add 'deleted' to user status CHECK constraint
-- Users are no longer hard-deleted; status is set to 'deleted' instead.

ALTER TABLE zeude_users
  DROP CONSTRAINT IF EXISTS zeude_users_status_check,
  ADD CONSTRAINT zeude_users_status_check CHECK (status IN ('active', 'inactive', 'deleted'));
