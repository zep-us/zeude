-- Add NOT NULL and CHECK constraints to zeude_skills.files
-- Phase 1b: Run AFTER confirming all rows have been migrated (files IS NOT NULL)
-- Split from 20260305000001 per architecture proposal §3.1 to avoid
-- long locks on large tables during UPDATE + constraint in single transaction.

-- Safety check: verify no NULL files remain before adding constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM zeude_skills WHERE files IS NULL) THEN
    RAISE EXCEPTION 'Cannot add NOT NULL constraint: % rows still have NULL files',
      (SELECT count(*) FROM zeude_skills WHERE files IS NULL);
  END IF;
END $$;

-- Step 1: Add NOT NULL constraint
ALTER TABLE zeude_skills ALTER COLUMN files SET NOT NULL;

-- Step 2: Add CHECK constraint for 512KB max size
ALTER TABLE zeude_skills ADD CONSTRAINT check_skill_files_size
  CHECK (pg_column_size(files) <= 524288);
