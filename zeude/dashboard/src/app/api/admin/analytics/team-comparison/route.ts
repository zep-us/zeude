import { getSession } from '@/lib/session'
import { getClickHouseClient } from '@/lib/clickhouse'

interface TeamMetrics {
  team: string
  memberCount: number
  totalTokens: number
  totalCost: number
  totalRequests: number
  skillAdoptionRate: number
  avgSessionLength: number
  cacheHitRate: number
}

interface TeamComparisonResponse {
  teams: TeamMetrics[]
  teamList: string[]
  period: string
  updatedAt: string
}

// GET: Fetch team comparison analytics for admin
export async function GET(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '30d'
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7

    const clickhouse = getClickHouseClient()

    if (!clickhouse) {
      return Response.json(
        { error: 'Analytics not configured', _notImplemented: true },
        { status: 501 }
      )
    }

    try {
      // Run all team queries in parallel
      const [usageResult, skillsResult, sessionResult, teamListResult] = await Promise.all([
        // Token usage + cost + cache hit rate per team
        clickhouse.query({
          query: `
            SELECT
              p.team as team,
              sum(t.input_tokens + t.output_tokens + t.cache_read_tokens) as total_tokens,
              sum(t.cost_usd) as total_cost,
              sum(t.request_count) as request_count,
              sum(t.cache_read_tokens) / nullIf(sum(t.input_tokens + t.cache_read_tokens), 0) as cache_hit_rate,
              count(DISTINCT t.user_id) as member_count
            FROM token_usage_hourly t
            INNER JOIN (
              SELECT user_id, any(team) as team
              FROM ai_prompts
              WHERE timestamp >= now() - INTERVAL ${days} DAY
                AND team != ''
                AND user_id != ''
              GROUP BY user_id
            ) p ON t.user_id = p.user_id
            WHERE t.hour >= now() - INTERVAL ${days} DAY
            GROUP BY p.team
            HAVING team != ''
            ORDER BY total_tokens DESC
          `,
          format: 'JSONEachRow',
        }),

        // Skill adoption rate per team
        clickhouse.query({
          query: `
            SELECT
              team,
              count(DISTINCT user_id) as total_users,
              count(DISTINCT CASE WHEN prompt_type IN ('skill', 'command') THEN user_id END) as skill_users
            FROM ai_prompts
            WHERE timestamp >= now() - INTERVAL ${days} DAY
              AND team != ''
              AND user_id != ''
            GROUP BY team
          `,
          format: 'JSONEachRow',
        }),

        // Average session length per team
        clickhouse.query({
          query: `
            SELECT
              team,
              avg(session_length) as avg_session_length
            FROM (
              SELECT
                team,
                session_id,
                count() as session_length
              FROM ai_prompts
              WHERE timestamp >= now() - INTERVAL ${days} DAY
                AND team != ''
                AND session_id != ''
              GROUP BY team, session_id
            )
            GROUP BY team
          `,
          format: 'JSONEachRow',
        }),

        // Team list for filter dropdown
        clickhouse.query({
          query: `
            SELECT DISTINCT team
            FROM ai_prompts
            WHERE timestamp >= now() - INTERVAL 90 DAY
              AND team != ''
            ORDER BY team
          `,
          format: 'JSONEachRow',
        }),
      ])

      const [usageDataRaw, skillsDataRaw, sessionDataRaw, teamListDataRaw] = await Promise.all([
        usageResult.json(),
        skillsResult.json(),
        sessionResult.json(),
        teamListResult.json(),
      ])

      const usageData = usageDataRaw as {
        team: string
        total_tokens: string
        total_cost: string
        request_count: string
        cache_hit_rate: string
        member_count: string
      }[]

      const skillsData = skillsDataRaw as {
        team: string
        total_users: string
        skill_users: string
      }[]

      const sessionData = sessionDataRaw as {
        team: string
        avg_session_length: string
      }[]

      const teamListData = teamListDataRaw as { team: string }[]

      // Build maps for easy lookup
      const skillsMap = new Map(skillsData.map(s => [
        s.team,
        {
          totalUsers: parseInt(s.total_users) || 0,
          skillUsers: parseInt(s.skill_users) || 0,
        }
      ]))

      const sessionMap = new Map(sessionData.map(s => [
        s.team,
        parseFloat(s.avg_session_length) || 0
      ]))

      // Combine into TeamMetrics
      const teams: TeamMetrics[] = usageData.map(row => {
        const team = row.team
        const skillData = skillsMap.get(team) || { totalUsers: 0, skillUsers: 0 }
        const avgSessionLength = sessionMap.get(team) || 0

        return {
          team,
          memberCount: parseInt(row.member_count) || 0,
          totalTokens: parseInt(row.total_tokens) || 0,
          totalCost: Math.round((parseFloat(row.total_cost) || 0) * 100) / 100,
          totalRequests: parseInt(row.request_count) || 0,
          skillAdoptionRate: skillData.totalUsers > 0
            ? Math.round((skillData.skillUsers / skillData.totalUsers) * 100)
            : 0,
          avgSessionLength: Math.round(avgSessionLength * 10) / 10,
          cacheHitRate: Math.round((parseFloat(row.cache_hit_rate) || 0) * 100) / 100,
        }
      })

      const teamList = teamListData.map(t => t.team)

      const response: TeamComparisonResponse = {
        teams,
        teamList,
        period,
        updatedAt: new Date().toISOString(),
      }

      return Response.json(response)
    } catch (chError) {
      console.error('ClickHouse query error:', chError)
      return Response.json({ error: 'Query failed' }, { status: 503 })
    }
  } catch (err) {
    console.error('Team comparison error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
