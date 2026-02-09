import { getSession } from '@/lib/session'
import { getClickHouseClient } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { calculateEfficiencyScore } from '@/lib/efficiency'
import { EXCLUDED_SKILLS } from '@/lib/skill-utils'

interface LeaderboardUser {
  rank: number
  userName: string
  value: number
  formattedValue: string
}

interface SkillLeaderboardUser {
  rank: number
  userName: string
  skillCount: number
  topSkill: string
}

interface LeaderboardResponse {
  topTokenUsers: LeaderboardUser[]
  topEfficiencyUsers: LeaderboardUser[]
  topSkillUsers: SkillLeaderboardUser[]
  skillAdoption: {
    totalUsers: number
    skillUsers: number
    adoptionRate: number
  }
  period: string
  updatedAt: string
}

// GET: Fetch leaderboard data (accessible to all authenticated users)
export async function GET(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '7d'
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7

    const clickhouse = getClickHouseClient()

    if (!clickhouse) {
      return Response.json(
        { error: 'Analytics not configured', _notImplemented: true },
        { status: 501 }
      )
    }

    try {
      // Run all queries in parallel with graceful degradation
      // Uses allSettled so a single slow/failing query doesn't take down the entire endpoint
      // Group by user_id for consistent identification (works for both email and Bedrock users)
      const results = await Promise.allSettled([
        // [0] Top 10 by total tokens used
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              sum(input_tokens + output_tokens + cache_read_tokens) as total_tokens
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL ${days} DAY
              AND user_id != ''
            GROUP BY user_id
            ORDER BY total_tokens DESC
            LIMIT 10
          `,
          format: 'JSONEachRow',
        }),

        // [1] Top 10 by composite efficiency score - minimum 10 requests to qualify
        // Uses token_usage_hourly only (no expensive view JOINs)
        // retry_density and growth_rate use defaults since the analysis views
        // scan all of claude_code_logs with window functions and timeout on large datasets
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              sum(output_tokens) as output_tokens,
              sum(cost_usd) as cost_usd,
              sum(cache_read_tokens) as cache_read_tokens,
              sum(request_count) as request_count,
              0.10 as retry_density,
              2.0 as growth_rate
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL ${days} DAY AND user_id != ''
            GROUP BY user_id
            HAVING sum(request_count) >= 10
          `,
          format: 'JSONEachRow',
        }),

        // [2] Top 10 by skill usage (most skill invocations)
        // Excludes internal/testing skills defined in EXCLUDED_SKILLS
        // Uses dedup subquery: ai_prompts uses MergeTree, PATCH inserts duplicate rows
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              count() as skill_count,
              topK(1)(invoked_name)[1] as top_skill
            FROM (
              SELECT
                prompt_id,
                argMax(user_id, timestamp) as user_id,
                argMax(user_email, timestamp) as user_email,
                argMax(prompt_type, timestamp) as prompt_type,
                argMax(invoked_name, timestamp) as invoked_name
              FROM ai_prompts
              WHERE timestamp >= now() - INTERVAL ${days} DAY
                AND user_id != ''
              GROUP BY prompt_id
            )
            WHERE prompt_type IN ('skill', 'command')
              AND invoked_name != ''
              AND invoked_name NOT IN (${EXCLUDED_SKILLS.map(s => `'${s}'`).join(', ')})
            GROUP BY user_id
            ORDER BY skill_count DESC
            LIMIT 10
          `,
          format: 'JSONEachRow',
        }),

        // [3] Skill adoption rate (how many users use skills)
        // Excludes internal/testing skills defined in EXCLUDED_SKILLS
        // Uses dedup subquery: ai_prompts uses MergeTree, PATCH inserts duplicate rows
        clickhouse.query({
          query: `
            SELECT
              count(DISTINCT user_id) as total_users,
              count(DISTINCT CASE
                WHEN prompt_type IN ('skill', 'command')
                  AND invoked_name NOT IN (${EXCLUDED_SKILLS.map(s => `'${s}'`).join(', ')})
                THEN user_id
              END) as skill_users
            FROM (
              SELECT
                prompt_id,
                argMax(user_id, timestamp) as user_id,
                argMax(prompt_type, timestamp) as prompt_type,
                argMax(invoked_name, timestamp) as invoked_name
              FROM ai_prompts
              WHERE timestamp >= now() - INTERVAL ${days} DAY
                AND user_id != ''
              GROUP BY prompt_id
            )
          `,
          format: 'JSONEachRow',
        }),
      ])

      // Extract results with graceful fallbacks
      const tokenDataRaw = results[0].status === 'fulfilled' ? await results[0].value.json() : []
      const efficiencyDataRaw = results[1].status === 'fulfilled' ? await results[1].value.json() : []
      const skillUsersDataRaw = results[2].status === 'fulfilled' ? await results[2].value.json() : []
      const skillAdoptionDataRaw = results[3].status === 'fulfilled' ? await results[3].value.json() : []

      // Log any failed queries for debugging
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const labels = ['token', 'efficiency', 'skillUsers', 'skillAdoption']
          console.error(`Leaderboard ${labels[i]} query failed:`, (results[i] as PromiseRejectedResult).reason)
        }
      }

      const tokenData = tokenDataRaw as { user_id: string; user_email: string; total_tokens: string }[]
      const efficiencyData = efficiencyDataRaw as { user_id: string; user_email: string; output_tokens: string; cost_usd: string; cache_read_tokens: string; request_count: string; retry_density: number; growth_rate: number }[]
      const skillUsersData = skillUsersDataRaw as { user_id: string; user_email: string; skill_count: string; top_skill: string }[]
      const skillAdoptionData = skillAdoptionDataRaw as { total_users: string; skill_users: string }[]

      // Collect all user_ids for name/email lookup
      const allUserIds = new Set<string>()
      for (const row of tokenData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }
      for (const row of efficiencyData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }
      for (const row of skillUsersData) {
        if (row.user_id) allUserIds.add(row.user_id)
      }

      // Lookup zeude.user.id from ClickHouse to map to Supabase UUID
      const userIdToZeudeId = new Map<string, string>()  // ClickHouse user_id -> Supabase UUID
      const userIdToEmail = new Map<string, string>()

      // Metadata lookup phase: wrapped in try/catch for graceful degradation
      // If lookup fails, leaderboard still works with user_id/email as display names
      try {
        if (allUserIds.size > 0) {
          const userIdList = Array.from(allUserIds).map(id => `'${id}'`).join(',')
          // Use GROUP BY with argMax to get deterministic 1:1 mapping per user_id
          // Time-bounded to leverage partition pruning on claude_code_logs
          const lookupResult = await clickhouse.query({
            query: `
              SELECT
                LogAttributes['user.id'] as user_id,
                argMax(LogAttributes['user.email'], Timestamp) as user_email,
                argMax(ResourceAttributes['zeude.user.id'], Timestamp) as zeude_user_id,
                argMax(ResourceAttributes['zeude.user.email'], Timestamp) as zeude_user_email
              FROM claude_code_logs
              WHERE Timestamp >= now() - INTERVAL 90 DAY
                AND LogAttributes['user.id'] IN (${userIdList})
              GROUP BY user_id
            `,
            format: 'JSONEachRow',
          })
          const lookupData = await lookupResult.json() as { user_id: string; user_email: string; zeude_user_id: string; zeude_user_email: string }[]
          for (const row of lookupData) {
            if (row.user_email) {
              userIdToEmail.set(row.user_id, row.user_email)
            } else if (row.zeude_user_email) {
              userIdToEmail.set(row.user_id, row.zeude_user_email)
            }
            if (row.zeude_user_id) {
              userIdToZeudeId.set(row.user_id, row.zeude_user_id)
            }
          }
        }
      } catch (lookupError) {
        console.error('Leaderboard user lookup failed (continuing with IDs):', lookupError)
      }

      // Lookup names from Supabase for all users
      const userIdToName = new Map<string, string>()
      const allZeudeIds = new Set<string>(userIdToZeudeId.values())

      // Also add emails as potential lookup keys (for users where email = zeude user id pattern)
      const allEmails = new Set<string>()
      for (const row of tokenData) {
        if (row.user_email) allEmails.add(row.user_email)
      }
      for (const row of efficiencyData) {
        if (row.user_email) allEmails.add(row.user_email)
      }
      for (const row of skillUsersData) {
        if (row.user_email) allEmails.add(row.user_email)
      }
      for (const email of userIdToEmail.values()) {
        allEmails.add(email)
      }

      try {
        if (allZeudeIds.size > 0 || allEmails.size > 0) {
          const supabase = createServerClient()
          const zeudeIdToName = new Map<string, string>()
          const emailToName = new Map<string, string>()

          // Query by zeude_id (Supabase UUID)
          if (allZeudeIds.size > 0) {
            const { data: usersByZeudeId } = await supabase
              .from('zeude_users')
              .select('id, name, email')
              .in('id', Array.from(allZeudeIds))

            if (usersByZeudeId) {
              for (const user of usersByZeudeId) {
                if (user.name) {
                  zeudeIdToName.set(user.id, user.name)
                  if (user.email) emailToName.set(user.email, user.name)
                }
              }
            }
          }

          // Query by email
          if (allEmails.size > 0) {
            const { data: usersByEmail } = await supabase
              .from('zeude_users')
              .select('id, name, email')
              .in('email', Array.from(allEmails))

            if (usersByEmail) {
              for (const user of usersByEmail) {
                if (user.name) {
                  if (!zeudeIdToName.has(user.id)) zeudeIdToName.set(user.id, user.name)
                  if (user.email && !emailToName.has(user.email)) emailToName.set(user.email, user.name)
                }
              }
            }
          }

          // Map zeude_id -> name back to ClickHouse user_id
          for (const [userId, zeudeId] of userIdToZeudeId) {
            if (zeudeIdToName.has(zeudeId)) {
              userIdToName.set(userId, zeudeIdToName.get(zeudeId)!)
            }
          }
          // Also map by email for users in tokenData/efficiencyData/skillUsersData
          for (const row of tokenData) {
            if (row.user_email && emailToName.has(row.user_email) && !userIdToName.has(row.user_id)) {
              userIdToName.set(row.user_id, emailToName.get(row.user_email)!)
            }
          }
          for (const row of efficiencyData) {
            if (row.user_email && emailToName.has(row.user_email) && !userIdToName.has(row.user_id)) {
              userIdToName.set(row.user_id, emailToName.get(row.user_email)!)
            }
          }
          for (const row of skillUsersData) {
            if (row.user_email && emailToName.has(row.user_email) && !userIdToName.has(row.user_id)) {
              userIdToName.set(row.user_id, emailToName.get(row.user_email)!)
            }
          }
        }
      } catch (nameError) {
        console.error('Leaderboard name lookup failed (continuing with emails/IDs):', nameError)
      }

      // Helper to get display name: prefer name, then email, then user_id
      const getDisplayName = (userId: string, chEmail: string): string => {
        // First try name from Supabase
        if (userIdToName.has(userId)) return userIdToName.get(userId)!
        // Then try email
        if (chEmail) return chEmail
        return userIdToEmail.get(userId) || userId || 'Unknown'
      }

      // Format token leaderboard
      const topTokenUsers: LeaderboardUser[] = tokenData.map((row, index) => {
        const tokens = parseInt(row.total_tokens) || 0
        return {
          rank: index + 1,
          userName: getDisplayName(row.user_id, row.user_email),
          value: tokens,
          formattedValue: formatTokens(tokens),
        }
      })

      // Calculate composite efficiency score and format efficiency leaderboard
      const efficiencyWithScores = efficiencyData.map((row) => {
        const { efficiencyScore } = calculateEfficiencyScore({
          retryDensity: row.retry_density || 0.10,
          growthRate: row.growth_rate || 2.0,
          outputTokens: parseInt(row.output_tokens) || 0,
          costUsd: parseFloat(row.cost_usd) || 0,
          cacheReadTokens: parseInt(row.cache_read_tokens) || 0,
          requestCount: parseInt(row.request_count) || 0,
        })

        return {
          user_id: row.user_id,
          user_email: row.user_email,
          efficiencyScore,
        }
      })

      // Sort by efficiency score descending and take top 10
      efficiencyWithScores.sort((a, b) => b.efficiencyScore - a.efficiencyScore)

      const topEfficiencyUsers: LeaderboardUser[] = efficiencyWithScores.slice(0, 10).map((row, index) => ({
        rank: index + 1,
        userName: getDisplayName(row.user_id, row.user_email),
        value: row.efficiencyScore,
        formattedValue: `${row.efficiencyScore}점`,
      }))

      // Format skill users leaderboard
      const topSkillUsers: SkillLeaderboardUser[] = skillUsersData.map((row, index) => ({
        rank: index + 1,
        userName: getDisplayName(row.user_id, row.user_email),
        skillCount: parseInt(row.skill_count) || 0,
        topSkill: row.top_skill || '',
      }))

      // Calculate skill adoption
      const adoptionRow = skillAdoptionData[0] || { total_users: '0', skill_users: '0' }
      const totalUsers = parseInt(adoptionRow.total_users) || 0
      const skillUsers = parseInt(adoptionRow.skill_users) || 0
      const skillAdoption = {
        totalUsers,
        skillUsers,
        adoptionRate: totalUsers > 0 ? Math.round((skillUsers / totalUsers) * 100) : 0,
      }

      const response: LeaderboardResponse = {
        topTokenUsers,
        topEfficiencyUsers,
        topSkillUsers,
        skillAdoption,
        period,
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
