import Database from 'better-sqlite3'

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS _sqlite_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS zeude_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    agent_key TEXT NOT NULL UNIQUE,
    team TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    disabled_skills TEXT NOT NULL DEFAULT '[]',
    invited_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_one_time_tokens (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_invites (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    team TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_by TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    content TEXT,
    files TEXT NOT NULL DEFAULT '{}',
    teams TEXT NOT NULL DEFAULT '[]',
    is_global INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    keywords TEXT NOT NULL DEFAULT '[]',
    primary_keywords TEXT NOT NULL DEFAULT '[]',
    secondary_keywords TEXT NOT NULL DEFAULT '[]',
    hint TEXT,
    is_general INTEGER NOT NULL DEFAULT 0,
    is_command INTEGER NOT NULL DEFAULT 0,
    contributors TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS zeude_hooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    event TEXT NOT NULL,
    description TEXT,
    script_content TEXT NOT NULL,
    script_type TEXT NOT NULL DEFAULT 'bash',
    env TEXT NOT NULL DEFAULT '{}',
    teams TEXT NOT NULL DEFAULT '[]',
    is_global INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    command TEXT NOT NULL DEFAULT '',
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    teams TEXT NOT NULL DEFAULT '[]',
    is_global INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    files TEXT NOT NULL DEFAULT '{}',
    teams TEXT NOT NULL DEFAULT '[]',
    is_global INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zeude_cohort_members (
    id TEXT PRIMARY KEY,
    cohort_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (cohort_key, user_id)
  );

  CREATE TABLE IF NOT EXISTS zeude_mcp_install_status (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mcp_server_id TEXT NOT NULL,
    installed INTEGER NOT NULL,
    version TEXT,
    last_checked_at TEXT NOT NULL,
    UNIQUE (user_id, mcp_server_id)
  );

  CREATE TABLE IF NOT EXISTS zeude_hook_install_status (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    hook_id TEXT NOT NULL,
    installed INTEGER NOT NULL,
    version TEXT,
    last_checked_at TEXT NOT NULL,
    UNIQUE (user_id, hook_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_team ON zeude_users(team);
  CREATE INDEX IF NOT EXISTS idx_users_status ON zeude_users(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON zeude_sessions(token);
  CREATE INDEX IF NOT EXISTS idx_tokens_token ON zeude_one_time_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_invites_token ON zeude_invites(token);
  CREATE INDEX IF NOT EXISTS idx_skills_status ON zeude_skills(status);
  CREATE INDEX IF NOT EXISTS idx_hooks_status ON zeude_hooks(status);
  CREATE INDEX IF NOT EXISTS idx_mcp_status ON zeude_mcp_servers(status);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON zeude_agents(status);
  `,
]

export function migrateSqlite(db: Database.Database) {
  const existingRows = db.prepare('SELECT name FROM _sqlite_migrations ORDER BY id').all() as { name: string }[]
  const applied = new Set(
    existingRows.map(row => row.name)
  )

  const insertMigration = db.prepare(
    'INSERT OR IGNORE INTO _sqlite_migrations(name, applied_at) VALUES (?, ?)'
  )

  MIGRATIONS.forEach((sql, index) => {
    const name = `migration_${index + 1}`
    if (applied.has(name)) {
      return
    }
    db.exec(sql)
    insertMigration.run(name, new Date().toISOString())
  })
}
