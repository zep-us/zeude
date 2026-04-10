const { createClient } = require('@supabase/supabase-js')
const { ensureSqliteReady, resolveDatabasePath } = require('./migrate-sqlite.cjs')

const PAGE_SIZE = 500
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const force = args.has('--force')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TABLES = [
  {
    source: 'zeude_users',
    target: 'zeude_users',
    orderBy: 'created_at',
    columns: ['id', 'email', 'name', 'agent_key', 'team', 'role', 'status', 'disabled_skills', 'invited_by', 'created_at', 'updated_at'],
    serialize: row => ({
      ...row,
      disabled_skills: JSON.stringify(row.disabled_skills || []),
    }),
  },
  {
    source: 'zeude_sessions',
    target: 'zeude_sessions',
    orderBy: 'created_at',
    columns: ['id', 'token', 'user_id', 'expires_at', 'created_at'],
  },
  {
    source: 'zeude_one_time_tokens',
    target: 'zeude_one_time_tokens',
    orderBy: 'created_at',
    columns: ['id', 'token', 'user_id', 'expires_at', 'created_at'],
  },
  {
    source: 'zeude_invites',
    target: 'zeude_invites',
    orderBy: 'created_at',
    columns: ['id', 'token', 'team', 'role', 'created_by', 'expires_at', 'used_at', 'used_by', 'created_at'],
  },
  {
    source: 'zeude_skills',
    target: 'zeude_skills',
    orderBy: 'created_at',
    columns: [
      'id', 'name', 'slug', 'description', 'content', 'files', 'teams', 'is_global', 'status',
      'created_by', 'created_at', 'updated_at', 'keywords', 'primary_keywords', 'secondary_keywords',
      'hint', 'is_general', 'is_command', 'contributors',
    ],
    serialize: row => ({
      ...row,
      files: JSON.stringify(row.files || {}),
      teams: JSON.stringify(row.teams || []),
      is_global: row.is_global ? 1 : 0,
      keywords: JSON.stringify(row.keywords || []),
      primary_keywords: JSON.stringify(row.primary_keywords || []),
      secondary_keywords: JSON.stringify(row.secondary_keywords || []),
      is_general: row.is_general ? 1 : 0,
      is_command: row.is_command ? 1 : 0,
      contributors: JSON.stringify(row.contributors || []),
    }),
  },
  {
    source: 'zeude_hooks',
    target: 'zeude_hooks',
    orderBy: 'created_at',
    columns: ['id', 'name', 'event', 'description', 'script_content', 'script_type', 'env', 'teams', 'is_global', 'status', 'created_by', 'created_at', 'updated_at'],
    serialize: row => ({
      ...row,
      env: JSON.stringify(row.env || {}),
      teams: JSON.stringify(row.teams || []),
      is_global: row.is_global ? 1 : 0,
    }),
  },
  {
    source: 'zeude_mcp_servers',
    target: 'zeude_mcp_servers',
    orderBy: 'created_at',
    columns: ['id', 'name', 'url', 'command', 'args', 'env', 'teams', 'is_global', 'status', 'created_by', 'created_at', 'updated_at'],
    serialize: row => ({
      ...row,
      args: JSON.stringify(row.args || []),
      env: JSON.stringify(row.env || {}),
      teams: JSON.stringify(row.teams || []),
      is_global: row.is_global ? 1 : 0,
    }),
  },
  {
    source: 'zeude_agents',
    target: 'zeude_agents',
    orderBy: 'created_at',
    columns: ['id', 'name', 'description', 'files', 'teams', 'is_global', 'status', 'created_by', 'created_at', 'updated_at'],
    serialize: row => ({
      ...row,
      files: JSON.stringify(row.files || {}),
      teams: JSON.stringify(row.teams || []),
      is_global: row.is_global ? 1 : 0,
    }),
  },
  {
    source: 'zeude_cohort_members',
    target: 'zeude_cohort_members',
    orderBy: 'created_at',
    columns: ['id', 'cohort_key', 'user_id', 'created_by', 'created_at'],
  },
  {
    source: 'zeude_mcp_install_status',
    target: 'zeude_mcp_install_status',
    orderBy: 'last_checked_at',
    columns: ['id', 'user_id', 'mcp_server_id', 'installed', 'version', 'last_checked_at'],
    serialize: row => ({
      ...row,
      installed: row.installed ? 1 : 0,
    }),
  },
  {
    source: 'zeude_hook_install_status',
    target: 'zeude_hook_install_status',
    orderBy: 'last_checked_at',
    columns: ['id', 'user_id', 'hook_id', 'installed', 'version', 'last_checked_at'],
    serialize: row => ({
      ...row,
      installed: row.installed ? 1 : 0,
    }),
  },
]

function usage() {
  console.log(`
Usage:
  npm run migrate:supabase-to-sqlite -- [--dry-run] [--force]

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional env:
  DATABASE_PATH

Flags:
  --dry-run  Print row counts without writing to SQLite
  --force    Allow importing into a non-empty SQLite database
  `)
}

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    usage()
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
}

async function fetchAllRows(supabase, table) {
  const rows = []
  let start = 0

  while (true) {
    const end = start + PAGE_SIZE - 1
    const query = supabase
      .from(table.source)
      .select(table.columns.join(','))
      .order(table.orderBy, { ascending: true })
      .range(start, end)

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to fetch ${table.source}: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    rows.push(...data)
    if (data.length < PAGE_SIZE) {
      break
    }
    start += PAGE_SIZE
  }

  return rows
}

function ensureTargetIsEmpty(db) {
  const occupied = []
  for (const table of TABLES) {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table.target}`).get()
    if (row.count > 0) {
      occupied.push(`${table.target}:${row.count}`)
    }
  }
  if (occupied.length > 0 && !force) {
    throw new Error(`Target SQLite DB is not empty (${occupied.join(', ')}). Re-run with --force to append/replace.`)
  }
}

function buildInsert(table) {
  const placeholders = table.columns.map(() => '?').join(', ')
  return `INSERT OR REPLACE INTO ${table.target}(${table.columns.join(', ')}) VALUES (${placeholders})`
}

async function main() {
  ensureEnv()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { db, databasePath } = ensureSqliteReady(resolveDatabasePath())
  ensureTargetIsEmpty(db)

  const summary = []

  try {
    for (const table of TABLES) {
      const rows = await fetchAllRows(supabase, table)
      summary.push({ table: table.target, rows: rows.length })

      if (dryRun || rows.length === 0) {
        continue
      }

      const insert = db.prepare(buildInsert(table))
      const write = db.transaction((items) => {
        for (const row of items) {
          const normalized = table.serialize ? table.serialize(row) : row
          insert.run(...table.columns.map(column => normalized[column] ?? null))
        }
      })
      write(rows)
    }
  } finally {
    db.close()
  }

  console.log(`Supabase -> SQLite ${dryRun ? 'dry run' : 'migration'} complete`)
  console.table(summary)
  console.log(`SQLite path: ${databasePath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
