import { getSession } from '@/lib/session'
import { getClickHouseClient, buildMVSourceCondition, parseSourceParam, escapeClickHouseString } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { EXCLUDED_SKILLS } from '@/lib/skill-utils'
import { resolveUserNames } from '@/lib/name-resolution'

interface LeaderboardUser {
  rank: number
  userName: string
  value: number
  formattedValue: string
  userId: string
}

interface LeaderboardResponse {
  topTokenUsers: LeaderboardUser[]
  previousTopTokenUsers: LeaderboardUser[]
  topSkills: {
    rank: number
    skillName: string
    description: string
    usageCount: number
    userCount: number
    topUsers: string[]
    formattedValue: string
  }[]
  weekWindow: {
    currentStart: string
    currentEnd: string
    previousStart: string
    previousEnd: string
    nextReset: string
    timezone: 'Asia/Seoul'
  }
  cohort?: {
    cohortKey: string
    memberCount: number
    startedAt?: string
    skillDayStart?: string
    skillDayEnd?: string
  }
  updatedAt: string
}

// GET: Fetch leaderboard data (accessible to all authenticated users)
export async function GET(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const clickhouse = getClickHouseClient()

    if (!clickhouse) {
      return Response.json(
        { error: 'Analytics not configured', _notImplemented: true },
        { status: 501 }
      )
    }

    const { searchParams } = new URL(req.url)
    const cohortKey = sanitizeCohortKey(searchParams.get('cohort') || '')
    const source = parseSourceParam(searchParams.get('source'))
    const sourceFilter = buildMVSourceCondition(source)

    const weekWindow = getWeeklyWindow(new Date())
    const excludedSkills = EXCLUDED_SKILLS.map(escapeClickHouseString).join(', ')
    const excludedSkillClause = excludedSkills ? `AND d_invoked_name NOT IN (${excludedSkills})` : ''
    const cohortFilter = cohortKey
      ? await resolveCohortFilter(cohortKey, clickhouse)
      : null

    if (cohortFilter && cohortFilter.memberCount === 0) {
      return Response.json(buildEmptyLeaderboardResponse(weekWindow, cohortKey, 0))
    }

    const tokenCurrentStartEpoch = cohortFilter ? cohortFilter.startedAtEpoch : weekWindow.currentStartEpoch
    const tokenCurrentStartUtcMs = cohortFilter ? cohortFilter.startedAtUtcMs : weekWindow.currentStartUtcMs
    const tokenPreviousStartEpoch = cohortFilter ? cohortFilter.startedAtEpoch : weekWindow.previousStartEpoch
    const tokenPreviousEndEpoch = cohortFilter ? cohortFilter.startedAtEpoch : weekWindow.currentStartEpoch
    const skillWindow = cohortFilter
      ? getKstDayWindowFromUtcMs(cohortFilter.startedAtUtcMs)
      : {
          startEpoch: weekWindow.currentStartEpoch,
          endEpoch: weekWindow.currentEndEpoch,
          startUtcMs: weekWindow.currentStartUtcMs,
          endUtcMs: weekWindow.currentEndUtcMs,
        }

    const tokenCohortClause = buildIdOnlyCohortWhereClause('user_id', cohortFilter)
    const promptCohortClause = buildCohortWhereClause('d_user_id', 'd_user_email', cohortFilter)

    try {
      // Run all queries in parallel with graceful degradation
      // Uses allSettled so a single slow/failing query doesn't take down the entire endpoint
      // Group by user_id for consistent identification (works for both email and Bedrock users)
      const results = await Promise.allSettled([
        // [0] Current week top token users (week resets Monday 08:00 KST)
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              sum(input_tokens + output_tokens + cache_read_tokens) as total_tokens
            FROM token_usage_hourly
            WHERE hour >= toDateTime(${tokenCurrentStartEpoch})
              AND hour < toDateTime(${weekWindow.currentEndEpoch})
              AND user_id != ''
              ${tokenCohortClause}
              ${sourceFilter}
            GROUP BY user_id
            ORDER BY total_tokens DESC
            LIMIT 10
          `,
          format: 'JSONEachRow',
        }),

        // [1] Previous week top token users (last Monday 08:00 KST cycle)
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              sum(input_tokens + output_tokens + cache_read_tokens) as total_tokens
            FROM token_usage_hourly
            WHERE hour >= toDateTime(${tokenPreviousStartEpoch})
              AND hour < toDateTime(${tokenPreviousEndEpoch})
              AND user_id != ''
              ${tokenCohortClause}
              ${sourceFilter}
            GROUP BY user_id
            ORDER BY total_tokens DESC
            LIMIT 10
          `,
          format: 'JSONEachRow',
        }),

        // [2] Current week top skills by usage
        // Excludes internal/testing skills defined in EXCLUDED_SKILLS
        // Uses dedup subquery: ai_prompts uses MergeTree, PATCH inserts duplicate rows
        clickhouse.query({
          query: `
            SELECT
              d_invoked_name as skill_name,
              count() as usage_count,
              uniqExact(d_user_id) as user_count
            FROM (
              SELECT
                prompt_id,
                argMax(user_id, timestamp) as d_user_id,
                argMax(user_email, timestamp) as d_user_email,
                argMax(prompt_type, timestamp) as d_prompt_type,
                argMax(invoked_name, timestamp) as d_invoked_name
              FROM ai_prompts
              WHERE timestamp >= toDateTime(${skillWindow.startEpoch})
                AND timestamp < toDateTime(${skillWindow.endEpoch})
                AND user_id != ''
              GROUP BY prompt_id
            )
            WHERE d_prompt_type IN ('skill', 'command')
              AND d_invoked_name != ''
              ${excludedSkillClause}
              ${promptCohortClause}
            GROUP BY d_invoked_name
            ORDER BY usage_count DESC, user_count DESC
            LIMIT 20
          `,
          format: 'JSONEachRow',
        }),

        // [3] Per-skill user breakdown (top users per skill)
        clickhouse.query({
          query: `
            SELECT
              d_invoked_name as skill_name,
              d_user_id as user_id,
              d_user_email as user_email,
              count() as usage_count
            FROM (
              SELECT
                prompt_id,
                argMax(user_id, timestamp) as d_user_id,
                argMax(user_email, timestamp) as d_user_email,
                argMax(prompt_type, timestamp) as d_prompt_type,
                argMax(invoked_name, timestamp) as d_invoked_name
              FROM ai_prompts
              WHERE timestamp >= toDateTime(${skillWindow.startEpoch})
                AND timestamp < toDateTime(${skillWindow.endEpoch})
                AND user_id != ''
              GROUP BY prompt_id
            )
            WHERE d_prompt_type IN ('skill', 'command')
              AND d_invoked_name != ''
              ${excludedSkillClause}
              ${promptCohortClause}
            GROUP BY d_invoked_name, d_user_id, d_user_email
            ORDER BY d_invoked_name, usage_count DESC
          `,
          format: 'JSONEachRow',
        }),
      ])

      // Extract results with graceful fallbacks
      const tokenDataRaw = results[0].status === 'fulfilled' ? await results[0].value.json() : []
      const previousTokenDataRaw = results[1].status === 'fulfilled' ? await results[1].value.json() : []
      const skillDataRaw = results[2].status === 'fulfilled' ? await results[2].value.json() : []
      const skillUsersDataRaw = results[3].status === 'fulfilled' ? await results[3].value.json() : []

      // Log any failed queries for debugging
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const labels = ['tokenCurrent', 'tokenPrevious', 'topSkills', 'skillUsers']
          console.error(`Leaderboard ${labels[i]} query failed:`, (results[i] as PromiseRejectedResult).reason)
        }
      }

      const tokenData = tokenDataRaw as { user_id: string; user_email: string; total_tokens: string }[]
      const previousTokenData = previousTokenDataRaw as { user_id: string; user_email: string; total_tokens: string }[]
      const skillData = skillDataRaw as { skill_name: string; usage_count: string; user_count: string }[]
      const skillUsersData = skillUsersDataRaw as { skill_name: string; user_id: string; user_email: string; usage_count: string }[]

      // Collect all user_ids for name/email lookup
      const allUserIds = new Set<string>()
      for (const row of tokenData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }
      for (const row of previousTokenData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }
      for (const row of skillUsersData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }

      // === Name Resolution (Zeude Identity SSOT) ===
      // Shared utility handles Supabase lookup + email fallback + error handling
      const supabase = createServerClient()
      const allRows = [...tokenData, ...previousTokenData, ...skillUsersData]
      const { getDisplayName } = await resolveUserNames(supabase, allRows)

      // Format token leaderboard
      const topTokenUsers: LeaderboardUser[] = tokenData.map((row, index) => {
        const tokens = parseInt(row.total_tokens) || 0
        return {
          rank: index + 1,
          userName: getDisplayName(row.user_id, row.user_email),
          userId: row.user_id,
          value: tokens,
          formattedValue: formatTokens(tokens),
        }
      })

      const previousTopTokenUsers: LeaderboardUser[] = previousTokenData.map((row, index) => {
        const tokens = parseInt(row.total_tokens) || 0
        return {
          rank: index + 1,
          userName: getDisplayName(row.user_id, row.user_email),
          userId: row.user_id,
          value: tokens,
          formattedValue: formatTokens(tokens),
        }
      })

      // Lookup skill descriptions from Supabase
      const skillDescriptionMap = new Map<string, string>()
      if (skillData.length > 0) {
        try {
          const supabase = createServerClient()
          const slugs = skillData.map(r => r.skill_name)
          const { data: skillRows } = await supabase
            .from('zeude_skills')
            .select('slug, description')
            .in('slug', slugs)
          if (skillRows) {
            for (const row of skillRows) {
              if (row.description) skillDescriptionMap.set(row.slug, row.description)
            }
          }
        } catch (descError) {
          console.error('Leaderboard skill description lookup failed:', descError)
        }
      }

      // Build per-skill top users map (max 5 names per skill)
      const skillTopUsersMap = new Map<string, string[]>()
      for (const row of skillUsersData) {
        const existing = skillTopUsersMap.get(row.skill_name) || []
        if (existing.length < 5) {
          existing.push(getDisplayName(row.user_id, row.user_email))
          skillTopUsersMap.set(row.skill_name, existing)
        }
      }

      const topSkills = skillData.map((row, index) => ({
        rank: index + 1,
        skillName: row.skill_name,
        description: skillDescriptionMap.get(row.skill_name) || '',
        usageCount: parseInt(row.usage_count) || 0,
        userCount: parseInt(row.user_count) || 0,
        topUsers: skillTopUsersMap.get(row.skill_name) || [],
        formattedValue: `${parseInt(row.usage_count) || 0} calls`,
      }))

      const response: LeaderboardResponse = {
        topTokenUsers,
        previousTopTokenUsers,
        topSkills,
        weekWindow: {
          currentStart: new Date(tokenCurrentStartUtcMs).toISOString(),
          currentEnd: new Date(weekWindow.currentEndUtcMs).toISOString(),
          previousStart: new Date(cohortFilter ? tokenCurrentStartUtcMs : weekWindow.previousStartUtcMs).toISOString(),
          previousEnd: new Date(cohortFilter ? tokenCurrentStartUtcMs : weekWindow.previousEndUtcMs).toISOString(),
          nextReset: new Date(weekWindow.nextResetUtcMs).toISOString(),
          timezone: 'Asia/Seoul',
        },
        cohort: cohortFilter
          ? {
            cohortKey: cohortFilter.cohortKey,
            memberCount: cohortFilter.memberCount,
            startedAt: new Date(cohortFilter.startedAtUtcMs).toISOString(),
            skillDayStart: new Date(skillWindow.startUtcMs).toISOString(),
            skillDayEnd: new Date(skillWindow.endUtcMs).toISOString(),
          }
          : undefined,
        updatedAt: new Date().toISOString(),
      }

      return Response.json(response)
    } catch (chError) {
      console.error('ClickHouse query error:', chError)
      return Response.json({ error: 'Query failed' }, { status: 503 })
    }
  } catch (err) {
    console.error('Leaderboard error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Format token count
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toString()
}

interface WeeklyWindow {
  previousStartEpoch: number
  currentStartEpoch: number
  currentEndEpoch: number
  previousStartUtcMs: number
  currentStartUtcMs: number
  currentEndUtcMs: number
  previousEndUtcMs: number
  nextResetUtcMs: number
}

interface CohortFilter {
  cohortKey: string
  memberCount: number
  userIds: string[]
  userEmails: string[]
  startedAtEpoch: number
  startedAtUtcMs: number
}

interface CohortMemberRow {
  user_id: string
  created_at: string
}

function getWeeklyWindow(nowUtc: Date): WeeklyWindow {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const WEEK_MS = 7 * DAY_MS

  const nowUtcMs = nowUtc.getTime()
  const nowKstMs = nowUtcMs + KST_OFFSET_MS
  const nowKst = new Date(nowKstMs)

  const dayOfWeek = nowKst.getUTCDay() // 0=Sun, 1=Mon, ... (in KST-shifted clock)
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const todayEightKstMs = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
    8,
    0,
    0,
    0
  )

  let currentStartKstMs = todayEightKstMs - daysSinceMonday * DAY_MS
  if (nowKstMs < currentStartKstMs) {
    currentStartKstMs -= WEEK_MS
  }

  const previousStartKstMs = currentStartKstMs - WEEK_MS
  const nextResetKstMs = currentStartKstMs + WEEK_MS

  const previousStartUtcMs = previousStartKstMs - KST_OFFSET_MS
  const currentStartUtcMs = currentStartKstMs - KST_OFFSET_MS
  const nextResetUtcMs = nextResetKstMs - KST_OFFSET_MS

  return {
    previousStartEpoch: Math.floor(previousStartUtcMs / 1000),
    currentStartEpoch: Math.floor(currentStartUtcMs / 1000),
    currentEndEpoch: Math.floor(nowUtcMs / 1000),
    previousStartUtcMs,
    currentStartUtcMs,
    currentEndUtcMs: nowUtcMs,
    previousEndUtcMs: currentStartUtcMs,
    nextResetUtcMs,
  }
}

function sanitizeCohortKey(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64)
}

function buildCohortWhereClause(idColumn: string, emailColumn: string, filter: CohortFilter | null): string {
  if (!filter) return ''

  const parts: string[] = []
  if (filter.userIds.length > 0) {
    parts.push(`${idColumn} IN (${filter.userIds.map(escapeClickHouseString).join(', ')})`)
  }
  if (filter.userEmails.length > 0) {
    parts.push(`${emailColumn} IN (${filter.userEmails.map(escapeClickHouseString).join(', ')})`)
  }

  if (parts.length === 0) {
    return 'AND 1 = 0'
  }

  return `AND (${parts.join(' OR ')})`
}

function buildIdOnlyCohortWhereClause(idColumn: string, filter: CohortFilter | null): string {
  if (!filter) return ''
  if (filter.userIds.length === 0) return 'AND 1 = 0'
  return `AND ${idColumn} IN (${filter.userIds.map(escapeClickHouseString).join(', ')})`
}

function buildEmptyLeaderboardResponse(
  weekWindow: WeeklyWindow,
  cohortKey: string,
  memberCount: number
): LeaderboardResponse {
  return {
    topTokenUsers: [],
    previousTopTokenUsers: [],
    topSkills: [],
    weekWindow: {
      currentStart: new Date(weekWindow.currentStartUtcMs).toISOString(),
      currentEnd: new Date(weekWindow.currentEndUtcMs).toISOString(),
      previousStart: new Date(weekWindow.previousStartUtcMs).toISOString(),
      previousEnd: new Date(weekWindow.previousEndUtcMs).toISOString(),
      nextReset: new Date(weekWindow.nextResetUtcMs).toISOString(),
      timezone: 'Asia/Seoul',
    },
    cohort: {
      cohortKey,
      memberCount,
    },
    updatedAt: new Date().toISOString(),
  }
}

async function resolveCohortFilter(
  cohortKey: string,
  clickhouse: ReturnType<typeof getClickHouseClient>
): Promise<CohortFilter> {
  const supabase = createServerClient()

  const { data: members, error: membersError } = await supabase
    .from('zeude_cohort_members')
    .select('user_id, created_at')
    .eq('cohort_key', cohortKey)

  if (membersError) {
    console.error('Failed to fetch cohort members:', membersError)
    return {
      cohortKey,
      memberCount: 0,
      userIds: [],
      userEmails: [],
      startedAtEpoch: Math.floor(Date.now() / 1000),
      startedAtUtcMs: Date.now(),
    }
  }

  const memberIds = Array.from(new Set((members || []).map(row => row.user_id).filter(Boolean)))
  const startedAtUtcMs =
    ((members || []) as CohortMemberRow[])
      .map(row => Date.parse(row.created_at || ''))
      .filter(ts => Number.isFinite(ts))
      .reduce((min, ts) => (ts < min ? ts : min), Number.POSITIVE_INFINITY)

  const normalizedStartedAtUtcMs =
    Number.isFinite(startedAtUtcMs) ? startedAtUtcMs : Date.now()

  if (memberIds.length === 0) {
    return {
      cohortKey,
      memberCount: 0,
      userIds: [],
      userEmails: [],
      startedAtEpoch: Math.floor(normalizedStartedAtUtcMs / 1000),
      startedAtUtcMs: normalizedStartedAtUtcMs,
    }
  }

  const { data: users, error: usersError } = await supabase
    .from('zeude_users')
    .select('id, email')
    .in('id', memberIds)

  if (usersError) {
    console.error('Failed to fetch cohort users:', usersError)
    return {
      cohortKey,
      memberCount: memberIds.length,
      userIds: [],
      userEmails: [],
      startedAtEpoch: Math.floor(normalizedStartedAtUtcMs / 1000),
      startedAtUtcMs: normalizedStartedAtUtcMs,
    }
  }

  const userEmails = Array.from(new Set((users || []).map(row => row.email).filter(Boolean)))
  // After migration 011, MV user_id = Supabase UUID — use directly, no ClickHouse bridge needed
  const zeudeIds = Array.from(new Set((users || []).map(row => row.id).filter(Boolean)))

  return {
    cohortKey,
    memberCount: memberIds.length,
    userIds: zeudeIds,
    userEmails,
    startedAtEpoch: Math.floor(normalizedStartedAtUtcMs / 1000),
    startedAtUtcMs: normalizedStartedAtUtcMs,
  }
}

function getKstDayWindowFromUtcMs(utcMs: number): {
  startEpoch: number
  endEpoch: number
  startUtcMs: number
  endUtcMs: number
} {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const kstMs = utcMs + KST_OFFSET_MS
  const kstDate = new Date(kstMs)

  const kstDayStartMs = Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate(),
    0,
    0,
    0,
    0
  )

  const startUtcMs = kstDayStartMs - KST_OFFSET_MS
  const endUtcMs = startUtcMs + DAY_MS

  return {
    startEpoch: Math.floor(startUtcMs / 1000),
    endEpoch: Math.floor(endUtcMs / 1000),
    startUtcMs,
    endUtcMs,
  }
}

