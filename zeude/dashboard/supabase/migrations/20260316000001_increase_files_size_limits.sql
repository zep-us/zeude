-- Increase files size limits for skills and agents
-- Skills: 512KB -> 5MB, Agents: 256KB -> 5MB
-- Supports larger multi-file skills and agent definitions

-- Skills: drop old 512KB constraint, add 5MB
ALTER TABLE zeude_skills DROP CONSTRAINT IF EXISTS check_skill_files_size;
ALTER TABLE zeude_skills ADD CONSTRAINT check_skill_files_size
  CHECK (pg_column_size(files) <= 5242880);

-- Agents: drop old 256KB constraint, add 5MB
ALTER TABLE zeude_agents DROP CONSTRAINT IF EXISTS check_agent_files_size;
ALTER TABLE zeude_agents ADD CONSTRAINT check_agent_files_size
  CHECK (pg_column_size(files) <= 5242880);
