import { getClickHouseClient } from './clickhouse'
import { unstable_cache } from 'next/cache'

export interface PromptRecord {
  prompt_id: string
  session_id: string
  user_id: string
  user_email: string
  team: string
  timestamp: string
  prompt_text: string
  prompt_length: number
  project_path: string
}

export interface PromptStats {
  total_prompts: number
  avg_length: number
  unique_sessions: number
  top_projects: { project: string; count: number }[]
}

export interface TeamTrend {
  date: string
  total_prompts: number
  unique_users: number
  avg_length: number
}

// User identifier: prefer user_id, fallback to user_email for backwards compatibility
interface UserIdentifier {
  userId?: string
  userEmail?: string
}

// Build WHERE clause for user identification
// Supports both userId and userEmail (OR condition for backwards compatibility)
function buildUserWhereClause(identifier: UserIdentifier): { clause: string; params: Record<string, string> } {
  // If both provided, use OR to match either (for backwards compatibility with old data)
  if (identifier.userId && identifier.userEmail) {
    return {
      clause: '(user_id = {userId:String} OR user_email = {userEmail:String})',
      params: { userId: identifier.userId, userEmail: identifier.userEmail }
    }
  }
  if (identifier.userId) {
    return {
      clause: 'user_id = {userId:String}',
      params: { userId: identifier.userId }
    }
  }
  if (identifier.userEmail) {
    return {
      clause: 'user_email = {userEmail:String}',
      params: { userEmail: identifier.userEmail }
    }
  }
  // Fallback: match nothing
  return { clause: '1 = 0', params: {} }
}

// Get recent prompts for a user
async function _getUserPrompts(
  identifier: UserIdentifier,
  limit: number = 50
): Promise<PromptRecord[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const { clause, params } = buildUserWhereClause(identifier)

  const result = await clickhouse.query({
    query: `
      SELECT
        prompt_id,
        session_id,
        user_id,
        user_email,
        team,
        timestamp,
        prompt_text,
        prompt_length,
        project_path
      FROM ai_prompts
      WHERE ${clause}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { ...params, limit },
    format: 'JSONEachRow',
  })
  return result.json()
}

export const getUserPrompts = unstable_cache(
  _getUserPrompts,
  ['user-prompts'],
  { revalidate: 30 }
)

// Legacy wrapper for backwards compatibility (accepts email string)
export async function getUserPromptsByEmail(
  userEmail: string,
  limit: number = 50
): Promise<PromptRecord[]> {
  return getUserPrompts({ userEmail }, limit)
}

// Get user prompt statistics
async function _getUserPromptStats(
  identifier: UserIdentifier,
  days: number = 30
): Promise<PromptStats> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) {
    return {
      total_prompts: 0,
      avg_length: 0,
      unique_sessions: 0,
      top_projects: [],
    }
  }

  const { clause, params } = buildUserWhereClause(identifier)

  const statsResult = await clickhouse.query({
    query: `
      SELECT
        count() as total_prompts,
        avg(prompt_length) as avg_length,
        count(DISTINCT session_id) as unique_sessions
      FROM ai_prompts
      WHERE ${clause}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
    `,
    query_params: { ...params, days },
    format: 'JSONEachRow',
  })
  const stats = (await statsResult.json() as { total_prompts: number; avg_length: number; unique_sessions: number }[])[0] || {
    total_prompts: 0,
    avg_length: 0,
    unique_sessions: 0,
  }

  const projectsResult = await clickhouse.query({
    query: `
      SELECT
        project_path as project,
        count() as count
      FROM ai_prompts
      WHERE ${clause}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
        AND project_path != ''
      GROUP BY project_path
      ORDER BY count DESC
      LIMIT 5
    `,
    query_params: { ...params, days },
    format: 'JSONEachRow',
  })
  const topProjects = await projectsResult.json() as { project: string; count: number }[]

  return {
    total_prompts: Number(stats.total_prompts),
    avg_length: Number(stats.avg_length),
    unique_sessions: Number(stats.unique_sessions),
    top_projects: topProjects,
  }
}

export const getUserPromptStats = unstable_cache(
  _getUserPromptStats,
  ['user-prompt-stats'],
  { revalidate: 60 }
)

// Legacy wrapper for backwards compatibility
export async function getUserPromptStatsByEmail(
  userEmail: string,
  days: number = 30
): Promise<PromptStats> {
  return getUserPromptStats({ userEmail }, days)
}

// Get team prompt trends
async function _getTeamTrends(
  team: string,
  days: number = 14
): Promise<TeamTrend[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const result = await clickhouse.query({
    query: `
      SELECT
        toDate(timestamp) as date,
        count() as total_prompts,
        count(DISTINCT user_id) as unique_users,
        avg(prompt_length) as avg_length
      FROM ai_prompts
      WHERE team = {team:String}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY date
      ORDER BY date DESC
    `,
    query_params: { team, days },
    format: 'JSONEachRow',
  })
  return result.json()
}

export const getTeamTrends = unstable_cache(
  _getTeamTrends,
  ['team-trends'],
  { revalidate: 60 }
)

// Get team's top prompt patterns (for AI coaching)
async function _getTeamPromptPatterns(
  team: string,
  limit: number = 100
): Promise<PromptRecord[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const result = await clickhouse.query({
    query: `
      SELECT
        prompt_id,
        session_id,
        user_id,
        user_email,
        team,
        timestamp,
        prompt_text,
        prompt_length,
        project_path
      FROM ai_prompts
      WHERE team = {team:String}
        AND timestamp >= now() - INTERVAL 7 DAY
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { team, limit },
    format: 'JSONEachRow',
  })
  return result.json()
}

export const getTeamPromptPatterns = unstable_cache(
  _getTeamPromptPatterns,
  ['team-prompt-patterns'],
  { revalidate: 120 }
)

// Search prompts by keyword
export async function searchPrompts(
  identifier: UserIdentifier,
  keyword: string,
  limit: number = 20
): Promise<PromptRecord[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const { clause, params } = buildUserWhereClause(identifier)

  const result = await clickhouse.query({
    query: `
      SELECT
        prompt_id,
        session_id,
        user_id,
        user_email,
        team,
        timestamp,
        prompt_text,
        prompt_length,
        project_path
      FROM ai_prompts
      WHERE ${clause}
        AND prompt_text ILIKE {pattern:String}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: {
      ...params,
      pattern: `%${keyword}%`,
      limit
    },
    format: 'JSONEachRow',
  })
  return result.json()
}

// ============================================================================
// Skill/Command/Agent Usage Analytics
// ============================================================================

export interface PromptTypeStats {
  prompt_type: string
  count: number
  percentage: number
}

export interface SkillUsage {
  invoked_name: string
  count: number
  last_used: string
}

export interface SkillUsageTrend {
  date: string
  natural: number
  skill: number
  command: number
  agent: number
  mcp_tool: number
}

// Get prompt type distribution for a user
async function _getUserPromptTypeStats(
  identifier: UserIdentifier,
  days: number = 30
): Promise<PromptTypeStats[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const { clause, params } = buildUserWhereClause(identifier)

  const result = await clickhouse.query({
    query: `
      SELECT
        prompt_type,
        count() as count
      FROM ai_prompts
      WHERE ${clause}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY prompt_type
      ORDER BY count DESC
    `,
    query_params: { ...params, days },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { prompt_type: string; count: string }[]
  const total = data.reduce((sum, row) => sum + parseInt(row.count), 0)

  return data.map(row => ({
    prompt_type: row.prompt_type || 'natural',
    count: parseInt(row.count),
    percentage: total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
  }))
}

export const getUserPromptTypeStats = unstable_cache(
  _getUserPromptTypeStats,
  ['user-prompt-type-stats'],
  { revalidate: 60 }
)

// Get top skills/commands used by a user
async function _getUserTopSkills(
  identifier: UserIdentifier,
  days: number = 30,
  limit: number = 20
): Promise<SkillUsage[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const { clause, params } = buildUserWhereClause(identifier)

  const result = await clickhouse.query({
    query: `
      SELECT
        invoked_name,
        count() as count,
        max(timestamp) as last_used
      FROM ai_prompts
      WHERE ${clause}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
        AND prompt_type IN ('skill', 'command', 'agent', 'mcp_tool')
        AND invoked_name != ''
      GROUP BY invoked_name
      ORDER BY count DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { ...params, days, limit },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { invoked_name: string; count: string; last_used: string }[]
  return data.map(row => ({
    invoked_name: row.invoked_name,
    count: parseInt(row.count),
    last_used: row.last_used
  }))
}

export const getUserTopSkills = unstable_cache(
  _getUserTopSkills,
  ['user-top-skills'],
  { revalidate: 60 }
)

// Get team prompt type distribution (team='all' for all teams)
async function _getTeamPromptTypeStats(
  team: string,
  days: number = 30
): Promise<PromptTypeStats[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const teamFilter = team === 'all' ? '1=1' : `team = {team:String}`
  const result = await clickhouse.query({
    query: `
      SELECT
        prompt_type,
        count() as count
      FROM ai_prompts
      WHERE ${teamFilter}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY prompt_type
      ORDER BY count DESC
    `,
    query_params: { team, days },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { prompt_type: string; count: string }[]
  const total = data.reduce((sum, row) => sum + parseInt(row.count), 0)

  return data.map(row => ({
    prompt_type: row.prompt_type || 'natural',
    count: parseInt(row.count),
    percentage: total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
  }))
}

export const getTeamPromptTypeStats = unstable_cache(
  _getTeamPromptTypeStats,
  ['team-prompt-type-stats'],
  { revalidate: 60 }
)

// Get team top skills/commands (team='all' for all teams)
async function _getTeamTopSkills(
  team: string,
  days: number = 30,
  limit: number = 20
): Promise<SkillUsage[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const teamFilter = team === 'all' ? '1=1' : `team = {team:String}`
  const result = await clickhouse.query({
    query: `
      SELECT
        invoked_name,
        count() as count,
        max(timestamp) as last_used
      FROM ai_prompts
      WHERE ${teamFilter}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
        AND prompt_type IN ('skill', 'command', 'agent', 'mcp_tool')
        AND invoked_name != ''
      GROUP BY invoked_name
      ORDER BY count DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { team, days, limit },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { invoked_name: string; count: string; last_used: string }[]
  return data.map(row => ({
    invoked_name: row.invoked_name,
    count: parseInt(row.count),
    last_used: row.last_used
  }))
}

export const getTeamTopSkills = unstable_cache(
  _getTeamTopSkills,
  ['team-top-skills'],
  { revalidate: 60 }
)

// Get skill usage trend over time (team='all' for all teams)
async function _getSkillUsageTrend(
  team: string,
  days: number = 14
): Promise<SkillUsageTrend[]> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return []

  const teamFilter = team === 'all' ? '1=1' : `team = {team:String}`
  const result = await clickhouse.query({
    query: `
      SELECT
        toDate(timestamp) as date,
        countIf(prompt_type = 'natural' OR prompt_type = '') as natural,
        countIf(prompt_type = 'skill') as skill,
        countIf(prompt_type = 'command') as command,
        countIf(prompt_type = 'agent') as agent,
        countIf(prompt_type = 'mcp_tool') as mcp_tool
      FROM ai_prompts
      WHERE ${teamFilter}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { team, days },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { date: string; natural: string; skill: string; command: string; agent: string; mcp_tool: string }[]
  return data.map(row => ({
    date: row.date,
    natural: parseInt(row.natural),
    skill: parseInt(row.skill),
    command: parseInt(row.command),
    agent: parseInt(row.agent),
    mcp_tool: parseInt(row.mcp_tool)
  }))
}

export const getSkillUsageTrend = unstable_cache(
  _getSkillUsageTrend,
  ['skill-usage-trend'],
  { revalidate: 60 }
)

// Get skill adoption rate (team='all' for all teams)
async function _getSkillAdoptionRate(
  team: string,
  days: number = 30
): Promise<{ total_users: number; skill_users: number; adoption_rate: number }> {
  const clickhouse = getClickHouseClient()
  if (!clickhouse) return { total_users: 0, skill_users: 0, adoption_rate: 0 }

  const teamFilter = team === 'all' ? '1=1' : `team = {team:String}`
  const result = await clickhouse.query({
    query: `
      SELECT
        count(DISTINCT user_id) as total_users,
        count(DISTINCT CASE WHEN prompt_type IN ('skill', 'command', 'agent', 'mcp_tool') THEN user_id END) as skill_users
      FROM ai_prompts
      WHERE ${teamFilter}
        AND timestamp >= now() - INTERVAL {days:UInt32} DAY
    `,
    query_params: { team, days },
    format: 'JSONEachRow',
  })

  const data = await result.json() as { total_users: string; skill_users: string }[]
  const row = data[0] || { total_users: '0', skill_users: '0' }
  const totalUsers = parseInt(row.total_users)
  const skillUsers = parseInt(row.skill_users)

  return {
    total_users: totalUsers,
    skill_users: skillUsers,
    adoption_rate: totalUsers > 0 ? Math.round((skillUsers / totalUsers) * 100) : 0
  }
}

export const getSkillAdoptionRate = unstable_cache(
  _getSkillAdoptionRate,
  ['skill-adoption-rate'],
  { revalidate: 120 }
)
