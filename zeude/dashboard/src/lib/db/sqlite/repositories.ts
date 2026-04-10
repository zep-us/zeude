import { randomUUID } from 'crypto'
import { getSqlite } from './connection'
import type {
  Agent,
  Hook,
  Invite,
  MCPServer,
  Session,
  Skill,
  User,
} from '@/lib/database.types'
import type {
  HookInstallStatusRecord,
  McpInstallStatusRecord,
  OperationalDb,
  SessionWithUser,
  UserListOptions,
  UserListResult,
} from '../types'

function nowIso() {
  return new Date().toISOString()
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null)
}

function toBool(value: unknown) {
  return value === 1 || value === true
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    agent_key: String(row.agent_key),
    team: String(row.team),
    role: row.role as User['role'],
    status: row.status as User['status'],
    disabled_skills: parseJson<string[]>(row.disabled_skills, []),
    invited_by: row.invited_by ? String(row.invited_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    token: String(row.token),
    user_id: String(row.user_id),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
  }
}

function mapInvite(row: Record<string, unknown>): Invite {
  return {
    id: String(row.id),
    token: String(row.token),
    team: String(row.team),
    role: row.role as Invite['role'],
    created_by: row.created_by ? String(row.created_by) : null,
    expires_at: String(row.expires_at),
    used_at: row.used_at ? String(row.used_at) : null,
    used_by: row.used_by ? String(row.used_by) : null,
    created_at: String(row.created_at),
  }
}

function mapSkill(row: Record<string, unknown>): Skill {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    content: row.content ? String(row.content) : null,
    files: parseJson<Record<string, string>>(row.files, {}),
    teams: parseJson<string[]>(row.teams, []),
    is_global: toBool(row.is_global),
    status: row.status as Skill['status'],
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    keywords: parseJson<string[]>(row.keywords, []),
    primary_keywords: parseJson<string[]>(row.primary_keywords, []),
    secondary_keywords: parseJson<string[]>(row.secondary_keywords, []),
    hint: row.hint ? String(row.hint) : null,
    is_general: toBool(row.is_general),
    is_command: toBool(row.is_command),
    contributors: parseJson<string[]>(row.contributors, []),
  }
}

function mapHook(row: Record<string, unknown>): Hook {
  return {
    id: String(row.id),
    name: String(row.name),
    event: row.event as Hook['event'],
    description: row.description ? String(row.description) : null,
    script_content: String(row.script_content),
    script_type: row.script_type as Hook['script_type'],
    env: parseJson<Record<string, string>>(row.env, {}),
    teams: parseJson<string[]>(row.teams, []),
    is_global: toBool(row.is_global),
    status: row.status as Hook['status'],
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapMcp(row: Record<string, unknown>): MCPServer {
  return {
    id: String(row.id),
    name: String(row.name),
    url: row.url ? String(row.url) : null,
    command: String(row.command ?? ''),
    args: parseJson<string[]>(row.args, []),
    env: parseJson<Record<string, string>>(row.env, {}),
    teams: parseJson<string[]>(row.teams, []),
    is_global: toBool(row.is_global),
    status: row.status as MCPServer['status'],
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    files: parseJson<Record<string, string>>(row.files, {}),
    teams: parseJson<string[]>(row.teams, []),
    is_global: toBool(row.is_global),
    status: row.status as Agent['status'],
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function rowMatchesTeam(jsonText: string, team: string) {
  return parseJson<string[]>(jsonText, []).includes(team)
}

function pickUpdatable<T extends Record<string, unknown>>(input: T) {
  return Object.entries(input).filter(([, value]) => value !== undefined)
}

function buildUpdateSql(table: string, id: string, updates: Record<string, unknown>) {
  const entries = pickUpdatable(updates)
  if (entries.length === 0) {
    return null
  }
  const sql = `UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`
  return { sql, values: [...entries.map(([, value]) => value), id] }
}

function listUsers(options: UserListOptions): UserListResult {
  const db = getSqlite()
  const clauses: string[] = []
  const params: unknown[] = []

  if (options.team) {
    clauses.push('team = ?')
    params.push(options.team)
  }

  if (options.status) {
    clauses.push('status = ?')
    params.push(options.status)
  }

  if (options.search) {
    clauses.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)')
    const value = `%${options.search.toLowerCase()}%`
    params.push(value, value)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const page = Math.max(options.page ?? 1, 1)
  const offset = (page - 1) * limit

  const rows = db.prepare(
    `
      SELECT id, email, name, team, role, status, created_at, updated_at
      FROM zeude_users
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
  ).all(...params, limit, offset) as Record<string, unknown>[]

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM zeude_users ${where}`).get(...params) as { count: number }

  return {
    users: rows.map(row => ({
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      team: String(row.team),
      role: row.role as User['role'],
      status: row.status as User['status'],
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    })),
    total: countRow.count,
  }
}

export function createOperationalDb(): OperationalDb {
  const db = getSqlite()

  const createSessionStmt = db.prepare(
    'INSERT INTO zeude_sessions(id, token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  const createTokenStmt = db.prepare(
    'INSERT INTO zeude_one_time_tokens(id, token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  )

  const toggleDisabledSkillTx = db.transaction((userId: string, slug: string, disabled: boolean) => {
    const row = db.prepare('SELECT disabled_skills FROM zeude_users WHERE id = ?').get(userId) as { disabled_skills?: string } | undefined
    const current = parseJson<string[]>(row?.disabled_skills, [])
    const next = disabled
      ? Array.from(new Set([...current, slug])).sort()
      : current.filter(item => item !== slug)
    db.prepare('UPDATE zeude_users SET disabled_skills = ?, updated_at = ? WHERE id = ?')
      .run(stringifyJson(next), nowIso(), userId)
    return next
  })

  const claimInviteTx = db.transaction((token: string, usedAt: string) => {
    const invite = db.prepare(
      `
      SELECT * FROM zeude_invites
      WHERE token = ?
        AND used_at IS NULL
        AND expires_at > ?
      `
    ).get(token, usedAt) as Record<string, unknown> | undefined

    if (!invite) {
      return null
    }

    db.prepare('UPDATE zeude_invites SET used_at = ? WHERE id = ?').run(usedAt, invite.id)
    return mapInvite({ ...invite, used_at: usedAt })
  })

  const upsertMcpStmt = db.prepare(
    `
      INSERT INTO zeude_mcp_install_status(id, user_id, mcp_server_id, installed, version, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, mcp_server_id)
      DO UPDATE SET
        installed = excluded.installed,
        version = excluded.version,
        last_checked_at = excluded.last_checked_at
    `
  )

  const upsertHookStmt = db.prepare(
    `
      INSERT INTO zeude_hook_install_status(id, user_id, hook_id, installed, version, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, hook_id)
      DO UPDATE SET
        installed = excluded.installed,
        version = excluded.version,
        last_checked_at = excluded.last_checked_at
    `
  )

  return {
    users: {
      findByAgentKey(agentKey) {
        const row = db.prepare('SELECT * FROM zeude_users WHERE agent_key = ?').get(agentKey) as Record<string, unknown> | undefined
        return row ? mapUser(row) : null
      },
      findById(id) {
        const row = db.prepare('SELECT * FROM zeude_users WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return row ? mapUser(row) : null
      },
      findByEmail(email) {
        const row = db.prepare('SELECT * FROM zeude_users WHERE LOWER(email) = LOWER(?)').get(email) as Record<string, unknown> | undefined
        return row ? mapUser(row) : null
      },
      findBasicById(id) {
        const row = db.prepare('SELECT id, email, name FROM zeude_users WHERE id = ?').get(id) as Record<string, unknown> | undefined
        if (!row) return null
        return {
          id: String(row.id),
          email: String(row.email),
          name: row.name ? String(row.name) : null,
        }
      },
      listByIds(ids) {
        if (ids.length === 0) return []
        const placeholders = ids.map(() => '?').join(', ')
        const rows = db.prepare(
          `SELECT id, email, name FROM zeude_users WHERE id IN (${placeholders})`
        ).all(...ids) as Record<string, unknown>[]
        return rows.map(row => ({
          id: String(row.id),
          email: String(row.email),
          name: row.name ? String(row.name) : null,
        }))
      },
      listAll() {
        const rows = db.prepare('SELECT * FROM zeude_users ORDER BY created_at DESC').all() as Record<string, unknown>[]
        return rows.map(mapUser)
      },
      listTeams() {
        const rows = db.prepare(
          `SELECT DISTINCT team FROM zeude_users WHERE team IS NOT NULL AND team != '' ORDER BY team`
        ).all() as { team: string }[]
        return rows.map(row => row.team)
      },
      listUsers,
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const updatedAt = input.updated_at ?? createdAt
        const id = input.id || randomUUID()
        db.prepare(
          `
          INSERT INTO zeude_users(
            id, email, name, agent_key, team, role, status, disabled_skills, invited_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          id,
          input.email.toLowerCase(),
          input.name ?? null,
          input.agent_key,
          input.team,
          input.role,
          input.status,
          stringifyJson(input.disabled_skills ?? []),
          input.invited_by ?? null,
          createdAt,
          updatedAt
        )
        return mapUser({
          ...input,
          id,
          email: input.email.toLowerCase(),
          disabled_skills: stringifyJson(input.disabled_skills ?? []),
          created_at: createdAt,
          updated_at: updatedAt,
        } as Record<string, unknown>)
      },
      updateById(id, updates) {
        const normalized: Record<string, unknown> = {
          ...updates,
          disabled_skills: updates.disabled_skills ? stringifyJson(updates.disabled_skills) : updates.disabled_skills,
          updated_at: nowIso(),
        }
        const built = buildUpdateSql('zeude_users', id, normalized)
        if (!built) return this.findById(id)
        db.prepare(built.sql).run(...built.values)
        return this.findById(id)
      },
      updateAgentKey(id, agentKey) {
        db.prepare('UPDATE zeude_users SET agent_key = ?, updated_at = ? WHERE id = ?').run(agentKey, nowIso(), id)
        const updated = db.prepare('SELECT * FROM zeude_users WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return updated ? mapUser(updated) : null
      },
      toggleDisabledSkill(userId, slug, disabled) {
        return toggleDisabledSkillTx(userId, slug, disabled)
      },
    },
    sessions: {
      findValidByTokenWithUser(token, nowIsoValue) {
        const row = db.prepare(
          `
          SELECT
            s.id as session_id,
            s.token,
            s.user_id,
            s.expires_at,
            s.created_at as session_created_at,
            u.id as user_row_id,
            u.email,
            u.name,
            u.agent_key,
            u.team,
            u.role,
            u.status,
            u.disabled_skills,
            u.invited_by,
            u.created_at as user_created_at,
            u.updated_at as user_updated_at
          FROM zeude_sessions s
          JOIN zeude_users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?
          `
        ).get(token, nowIsoValue) as Record<string, unknown> | undefined

        if (!row) return null

        const user = mapUser({
          id: row.user_row_id,
          email: row.email,
          name: row.name,
          agent_key: row.agent_key,
          team: row.team,
          role: row.role,
          status: row.status,
          disabled_skills: row.disabled_skills,
          invited_by: row.invited_by,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        })

        return {
          id: String(row.session_id),
          token: String(row.token),
          user_id: String(row.user_id),
          expires_at: String(row.expires_at),
          created_at: String(row.session_created_at),
          user,
        }
      },
      create(input) {
        const createdAt = nowIso()
        const id = randomUUID()
        createSessionStmt.run(id, input.token, input.user_id, input.expires_at, createdAt)
        return {
          id,
          token: input.token,
          user_id: input.user_id,
          expires_at: input.expires_at,
          created_at: createdAt,
        }
      },
      deleteByToken(token) {
        db.prepare('DELETE FROM zeude_sessions WHERE token = ?').run(token)
      },
    },
    tokens: {
      create(input) {
        createTokenStmt.run(randomUUID(), input.token, input.user_id, input.expires_at, nowIso())
      },
      findValidByTokenWithUser(token, nowIsoValue) {
        const row = db.prepare(
          `
          SELECT
            t.id as token_id,
            t.token,
            t.user_id,
            t.expires_at,
            t.created_at as token_created_at,
            u.id as user_row_id,
            u.email,
            u.name,
            u.agent_key,
            u.team,
            u.role,
            u.status,
            u.disabled_skills,
            u.invited_by,
            u.created_at as user_created_at,
            u.updated_at as user_updated_at
          FROM zeude_one_time_tokens t
          JOIN zeude_users u ON u.id = t.user_id
          WHERE t.token = ? AND t.expires_at > ?
          `
        ).get(token, nowIsoValue) as Record<string, unknown> | undefined

        if (!row) return null

        const user = mapUser({
          id: row.user_row_id,
          email: row.email,
          name: row.name,
          agent_key: row.agent_key,
          team: row.team,
          role: row.role,
          status: row.status,
          disabled_skills: row.disabled_skills,
          invited_by: row.invited_by,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        })

        return {
          id: String(row.token_id),
          token: String(row.token),
          user_id: String(row.user_id),
          expires_at: String(row.expires_at),
          created_at: String(row.token_created_at),
          user,
        }
      },
      deleteById(id) {
        db.prepare('DELETE FROM zeude_one_time_tokens WHERE id = ?').run(id)
      },
    },
    invites: {
      findByToken(token) {
        const row = db.prepare('SELECT * FROM zeude_invites WHERE token = ?').get(token) as Record<string, unknown> | undefined
        return row ? mapInvite(row) : null
      },
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const id = input.id || randomUUID()
        db.prepare(
          `
          INSERT INTO zeude_invites(
            id, token, team, role, created_by, expires_at, used_at, used_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          id,
          input.token,
          input.team,
          input.role,
          input.created_by ?? null,
          input.expires_at,
          input.used_at ?? null,
          input.used_by ?? null,
          createdAt
        )
        return mapInvite({
          ...input,
          id,
          created_at: createdAt,
        } as Record<string, unknown>)
      },
      listRecent(limit = 50) {
        const boundedLimit = Math.min(Math.max(limit, 1), 100)
        const rows = db.prepare(
          `
          SELECT * FROM zeude_invites
          ORDER BY created_at DESC
          LIMIT ?
          `
        ).all(boundedLimit) as Record<string, unknown>[]
        return rows.map(mapInvite)
      },
      claimByToken(token, usedAt) {
        return claimInviteTx(token, usedAt)
      },
      resetClaim(id) {
        db.prepare('UPDATE zeude_invites SET used_at = NULL, used_by = NULL WHERE id = ?').run(id)
      },
      markUsedBy(id, userId) {
        db.prepare('UPDATE zeude_invites SET used_by = ? WHERE id = ?').run(userId, id)
      },
    },
    skills: {
      listAll() {
        const rows = db.prepare('SELECT * FROM zeude_skills ORDER BY created_at DESC').all() as Record<string, unknown>[]
        return rows.map(mapSkill)
      },
      listBySlugs(slugs) {
        if (slugs.length === 0) return []
        const placeholders = slugs.map(() => '?').join(', ')
        const rows = db.prepare(
          `SELECT slug, description FROM zeude_skills WHERE slug IN (${placeholders})`
        ).all(...slugs) as Record<string, unknown>[]
        return rows.map(row => ({
          slug: String(row.slug),
          description: row.description ? String(row.description) : null,
        }))
      },
      findById(id) {
        const row = db.prepare('SELECT * FROM zeude_skills WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return row ? mapSkill(row) : null
      },
      listActiveForTeam(team) {
        const rows = db.prepare(
          'SELECT * FROM zeude_skills WHERE status = ? ORDER BY id ASC'
        ).all('active') as Record<string, unknown>[]
        return rows
          .filter(row => toBool(row.is_global) || rowMatchesTeam(String(row.teams ?? '[]'), team))
          .map(mapSkill)
      },
      findAccessibleActiveBySlug(team, slug) {
        const rows = db.prepare(
          'SELECT id, slug, teams, is_global FROM zeude_skills WHERE slug = ? AND status = ? LIMIT 1'
        ).all(slug, 'active') as Record<string, unknown>[]
        const row = rows.find(item => toBool(item.is_global) || rowMatchesTeam(String(item.teams ?? '[]'), team))
        return row ? { id: String(row.id), slug: String(row.slug) } : null
      },
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const updatedAt = input.updated_at ?? createdAt
        const id = input.id || randomUUID()
        db.prepare(`
          INSERT INTO zeude_skills(
            id,name,slug,description,content,files,teams,is_global,status,created_by,created_at,updated_at,
            keywords,primary_keywords,secondary_keywords,hint,is_general,is_command,contributors
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, input.name, input.slug, input.description ?? null, input.content ?? null,
          stringifyJson(input.files ?? {}), stringifyJson(input.teams ?? []), input.is_global ? 1 : 0,
          input.status, input.created_by ?? null, createdAt, updatedAt,
          stringifyJson(input.keywords ?? []), stringifyJson(input.primary_keywords ?? []),
          stringifyJson(input.secondary_keywords ?? []), input.hint ?? null,
          input.is_general ? 1 : 0, input.is_command ? 1 : 0, stringifyJson(input.contributors ?? [])
        )
        return this.findById(id)!
      },
      updateById(id, updates) {
        const normalized: Record<string, unknown> = {
          ...updates,
          files: updates.files ? stringifyJson(updates.files) : updates.files,
          teams: updates.teams ? stringifyJson(updates.teams) : updates.teams,
          keywords: updates.keywords ? stringifyJson(updates.keywords) : updates.keywords,
          primary_keywords: updates.primary_keywords ? stringifyJson(updates.primary_keywords) : updates.primary_keywords,
          secondary_keywords: updates.secondary_keywords ? stringifyJson(updates.secondary_keywords) : updates.secondary_keywords,
          contributors: updates.contributors ? stringifyJson(updates.contributors) : updates.contributors,
          is_global: updates.is_global === undefined ? undefined : (updates.is_global ? 1 : 0),
          is_general: updates.is_general === undefined ? undefined : (updates.is_general ? 1 : 0),
          is_command: updates.is_command === undefined ? undefined : (updates.is_command ? 1 : 0),
          updated_at: nowIso(),
        }
        const built = buildUpdateSql('zeude_skills', id, normalized)
        if (!built) return this.findById(id)
        db.prepare(built.sql).run(...built.values)
        return this.findById(id)
      },
      deleteById(id) {
        const result = db.prepare('DELETE FROM zeude_skills WHERE id = ?').run(id)
        return result.changes > 0
      },
    },
    hooks: {
      listAll() {
        const rows = db.prepare('SELECT * FROM zeude_hooks ORDER BY created_at DESC').all() as Record<string, unknown>[]
        return rows.map(mapHook)
      },
      findById(id) {
        const row = db.prepare('SELECT * FROM zeude_hooks WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return row ? mapHook(row) : null
      },
      listActiveForTeam(team) {
        const rows = db.prepare(
          'SELECT * FROM zeude_hooks WHERE status = ? ORDER BY id ASC'
        ).all('active') as Record<string, unknown>[]
        return rows
          .filter(row => toBool(row.is_global) || rowMatchesTeam(String(row.teams ?? '[]'), team))
          .map(mapHook)
      },
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const updatedAt = input.updated_at ?? createdAt
        const id = input.id || randomUUID()
        db.prepare(`
          INSERT INTO zeude_hooks(
            id,name,event,description,script_content,script_type,env,teams,is_global,status,created_by,created_at,updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, input.name, input.event, input.description ?? null, input.script_content, input.script_type,
          stringifyJson(input.env ?? {}), stringifyJson(input.teams ?? []), input.is_global ? 1 : 0,
          input.status, input.created_by ?? null, createdAt, updatedAt
        )
        return this.findById(id)!
      },
      updateById(id, updates) {
        const normalized: Record<string, unknown> = {
          ...updates,
          env: updates.env ? stringifyJson(updates.env) : updates.env,
          teams: updates.teams ? stringifyJson(updates.teams) : updates.teams,
          is_global: updates.is_global === undefined ? undefined : (updates.is_global ? 1 : 0),
          updated_at: nowIso(),
        }
        const built = buildUpdateSql('zeude_hooks', id, normalized)
        if (!built) return this.findById(id)
        db.prepare(built.sql).run(...built.values)
        return this.findById(id)
      },
      deleteById(id) {
        const result = db.prepare('DELETE FROM zeude_hooks WHERE id = ?').run(id)
        return result.changes > 0
      },
    },
    mcp: {
      listAll() {
        const rows = db.prepare('SELECT * FROM zeude_mcp_servers ORDER BY created_at DESC').all() as Record<string, unknown>[]
        return rows.map(mapMcp)
      },
      findById(id) {
        const row = db.prepare('SELECT * FROM zeude_mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return row ? mapMcp(row) : null
      },
      listActiveForTeam(team) {
        const rows = db.prepare(
          'SELECT * FROM zeude_mcp_servers WHERE status = ? ORDER BY id ASC'
        ).all('active') as Record<string, unknown>[]
        return rows
          .filter(row => toBool(row.is_global) || rowMatchesTeam(String(row.teams ?? '[]'), team))
          .map(mapMcp)
      },
      listActiveNamesAndIds() {
        const rows = db.prepare(
          'SELECT id, name FROM zeude_mcp_servers WHERE status = ? ORDER BY id ASC'
        ).all('active') as Record<string, unknown>[]
        return rows.map(row => ({ id: String(row.id), name: String(row.name) }))
      },
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const updatedAt = input.updated_at ?? createdAt
        const id = input.id || randomUUID()
        db.prepare(`
          INSERT INTO zeude_mcp_servers(
            id,name,url,command,args,env,teams,is_global,status,created_by,created_at,updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, input.name, input.url ?? null, input.command, stringifyJson(input.args ?? []),
          stringifyJson(input.env ?? {}), stringifyJson(input.teams ?? []), input.is_global ? 1 : 0,
          input.status, input.created_by ?? null, createdAt, updatedAt
        )
        return this.findById(id)!
      },
      updateById(id, updates) {
        const normalized: Record<string, unknown> = {
          ...updates,
          args: updates.args ? stringifyJson(updates.args) : updates.args,
          env: updates.env ? stringifyJson(updates.env) : updates.env,
          teams: updates.teams ? stringifyJson(updates.teams) : updates.teams,
          is_global: updates.is_global === undefined ? undefined : (updates.is_global ? 1 : 0),
          updated_at: nowIso(),
        }
        const built = buildUpdateSql('zeude_mcp_servers', id, normalized)
        if (!built) return this.findById(id)
        db.prepare(built.sql).run(...built.values)
        return this.findById(id)
      },
      deleteById(id) {
        const result = db.prepare('DELETE FROM zeude_mcp_servers WHERE id = ?').run(id)
        return result.changes > 0
      },
    },
    agents: {
      listAll() {
        const rows = db.prepare('SELECT * FROM zeude_agents ORDER BY created_at DESC').all() as Record<string, unknown>[]
        return rows.map(mapAgent)
      },
      findById(id) {
        const row = db.prepare('SELECT * FROM zeude_agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
        return row ? mapAgent(row) : null
      },
      listActiveForTeam(team) {
        const rows = db.prepare(
          'SELECT * FROM zeude_agents WHERE status = ? ORDER BY id ASC'
        ).all('active') as Record<string, unknown>[]
        return rows
          .filter(row => toBool(row.is_global) || rowMatchesTeam(String(row.teams ?? '[]'), team))
          .map(mapAgent)
      },
      create(input) {
        const createdAt = input.created_at ?? nowIso()
        const updatedAt = input.updated_at ?? createdAt
        const id = input.id || randomUUID()
        db.prepare(`
          INSERT INTO zeude_agents(
            id,name,description,files,teams,is_global,status,created_by,created_at,updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, input.name, input.description ?? null, stringifyJson(input.files ?? {}),
          stringifyJson(input.teams ?? []), input.is_global ? 1 : 0, input.status,
          input.created_by ?? null, createdAt, updatedAt
        )
        return this.findById(id)!
      },
      updateById(id, updates) {
        const normalized: Record<string, unknown> = {
          ...updates,
          files: updates.files ? stringifyJson(updates.files) : updates.files,
          teams: updates.teams ? stringifyJson(updates.teams) : updates.teams,
          is_global: updates.is_global === undefined ? undefined : (updates.is_global ? 1 : 0),
          updated_at: nowIso(),
        }
        const built = buildUpdateSql('zeude_agents', id, normalized)
        if (!built) return this.findById(id)
        db.prepare(built.sql).run(...built.values)
        return this.findById(id)
      },
      deleteById(id) {
        const result = db.prepare('DELETE FROM zeude_agents WHERE id = ?').run(id)
        return result.changes > 0
      },
    },
    installStatus: {
      upsertMcpStatuses(statuses: McpInstallStatusRecord[]) {
        const tx = db.transaction((items: McpInstallStatusRecord[]) => {
          let count = 0
          for (const item of items) {
            upsertMcpStmt.run(
              randomUUID(),
              item.user_id,
              item.mcp_server_id,
              item.installed ? 1 : 0,
              item.version,
              item.last_checked_at
            )
            count += 1
          }
          return count
        })
        return tx(statuses)
      },
      upsertHookStatuses(statuses: HookInstallStatusRecord[]) {
        const tx = db.transaction((items: HookInstallStatusRecord[]) => {
          let count = 0
          for (const item of items) {
            upsertHookStmt.run(
              randomUUID(),
              item.user_id,
              item.hook_id,
              item.installed ? 1 : 0,
              item.version,
              item.last_checked_at
            )
            count += 1
          }
          return count
        })
        return tx(statuses)
      },
      listMcpStatuses() {
        return db.prepare('SELECT user_id, mcp_server_id, installed, version, last_checked_at FROM zeude_mcp_install_status').all() as McpInstallStatusRecord[]
      },
      listHookStatuses() {
        return db.prepare('SELECT user_id, hook_id, installed, version, last_checked_at FROM zeude_hook_install_status').all() as HookInstallStatusRecord[]
      },
    },
    cohorts: {
      listMembers(cohortKey) {
        return db.prepare(
          `
          SELECT user_id, created_at
          FROM zeude_cohort_members
          WHERE cohort_key = ?
          ORDER BY created_at ASC
          `
        ).all(cohortKey) as { user_id: string; created_at: string }[]
      },
      addMembers(cohortKey, userIds, createdBy) {
        const tx = db.transaction((items: string[]) => {
          const stmt = db.prepare(
            `
            INSERT OR IGNORE INTO zeude_cohort_members(id, cohort_key, user_id, created_by, created_at)
            VALUES (?, ?, ?, ?, ?)
            `
          )
          let inserted = 0
          const createdAt = nowIso()
          for (const userId of items) {
            const result = stmt.run(randomUUID(), cohortKey, userId, createdBy, createdAt)
            inserted += result.changes
          }
          return inserted
        })
        return tx(Array.from(new Set(userIds.filter(Boolean))))
      },
      countMembers(cohortKey) {
        const row = db.prepare(
          'SELECT COUNT(*) as count FROM zeude_cohort_members WHERE cohort_key = ?'
        ).get(cohortKey) as { count: number }
        return row.count
      },
    },
  }
}
