import { getSession } from '@/lib/session'
import { getClickHouseClient } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'

interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  cacheHitRate: number
  totalRequests: number
}

interface UserUsage {
  userId: string
  userName: string
  team: string
  inputTokens: number
  outputTokens: number
  cost: number
  cacheHitRate: number
  requestCount: number
}

interface TrendPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cost: number
}

interface UsageResponse {
  summary: UsageSummary
  byUser: UserUsage[]
  trend: TrendPoint[]
}

// GET: Fetch token usage analytics
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
    const period = searchParams.get('period') || '7d'

    // Calculate date range
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7

    // Try to query ClickHouse
    const clickhouse = getClickHouseClient()

    if (!clickhouse) {
      // ClickHouse not configured - return 501 Not Implemented
      return Response.json(
        {
          error: 'Analytics not yet configured',
          message: 'ClickHouse connection is not configured. Please set CLICKHOUSE_URL environment variable.',
          _notImplemented: true,
        },
        { status: 501 }
      )
    }

    try {
      // Query MV for performance (cost_usd stored directly)
      const [summaryResult, trendResult, userResult] = await Promise.all([
        // Summary query - from MV with cost_usd
        clickhouse.query({
          query: `
            SELECT
              sum(input_tokens) as input_tokens,
              sum(output_tokens) as output_tokens,
              sum(cache_read_tokens) as cache_read_tokens,
              sum(cost_usd) as cost,
              sum(request_count) as request_count
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL ${days} DAY
          `,
          format: 'JSONEachRow',
        }),

        // Trend query - from MV with cost_usd
        clickhouse.query({
          query: `
            SELECT
              formatDateTime(toDate(hour), '%Y-%m-%d') as date,
              sum(input_tokens) as input_tokens,
              sum(output_tokens) as output_tokens,
              sum(cache_read_tokens) as cache_read_tokens,
              sum(cost_usd) as cost
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL ${days} DAY
            GROUP BY date
            ORDER BY date
          `,
          format: 'JSONEachRow',
        }),

        // User breakdown query - from MV with cost_usd
        clickhouse.query({
          query: `
            SELECT
              user_id,
              any(user_email) as user_email,
              sum(input_tokens) as input_tokens,
              sum(output_tokens) as output_tokens,
              sum(cache_read_tokens) as cache_read_tokens,
              sum(cost_usd) as cost,
              sum(request_count) as request_count
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL ${days} DAY
            GROUP BY user_id
            ORDER BY input_tokens DESC
          `,
          format: 'JSONEachRow',
        }),
      ])

      // Parse results in parallel
      const [summaryDataRaw, trendDataRaw, userDataRaw] = await Promise.all([
        summaryResult.json(),
        trendResult.json(),
        userResult.json(),
      ])

      const summaryData = summaryDataRaw as {
        input_tokens: string
        output_tokens: string
        cache_read_tokens: string
        cost: string
        request_count: string
      }[]
      const trendData = trendDataRaw as {
        date: string
        input_tokens: string
        output_tokens: string
        cache_read_tokens: string
        cost: string
      }[]
      const userData = userDataRaw as {
        user_email: string
        user_id: string
        input_tokens: string
        output_tokens: string
        cache_read_tokens: string
        cost: string
        request_count: string
      }[]

      // Process summary - use cost_usd directly from logs
      const summary = summaryData[0] || {
        input_tokens: '0',
        output_tokens: '0',
        cache_read_tokens: '0',
        cost: '0',
        request_count: '0',
      }
      const totalInput = parseInt(summary.input_tokens) || 0
      const totalOutput = parseInt(summary.output_tokens) || 0
      const totalCacheRead = parseInt(summary.cache_read_tokens) || 0
      const totalCost = parseFloat(summary.cost) || 0
      const totalRequests = parseInt(summary.request_count) || 0

      // Process trend - cost comes directly from query
      const trend: TrendPoint[] = trendData.map(row => ({
        date: row.date,
        inputTokens: parseInt(row.input_tokens) || 0,
        outputTokens: parseInt(row.output_tokens) || 0,
        cost: Math.round((parseFloat(row.cost) || 0) * 100) / 100,
      }))

      // Collect user_ids that need email lookup
      const userIdsNeedingLookup = new Set<string>()
      for (const row of userData) {
        if (!row.user_email && row.user_id) {
          userIdsNeedingLookup.add(row.user_id)
        }
      }

      // Lookup emails from claude_code_logs (includes zeude.user.email for Bedrock users)
      const userIdToEmail = new Map<string, string>()
      if (userIdsNeedingLookup.size > 0) {
        const userIdList = Array.from(userIdsNeedingLookup).map(id => `'${id}'`).join(',')
        const emailLookupResult = await clickhouse.query({
          query: `
            SELECT DISTINCT
              LogAttributes['user.id'] as user_id,
              LogAttributes['user.email'] as user_email,
              ResourceAttributes['zeude.user.email'] as zeude_user_email
            FROM claude_code_logs
            WHERE LogAttributes['user.id'] IN (${userIdList})
          `,
          format: 'JSONEachRow',
        })
        const emailData = await emailLookupResult.json() as { user_id: string; user_email: string; zeude_user_email: string }[]
        for (const row of emailData) {
          // Priority: user.email > zeude.user.email
          if (row.user_email && !userIdToEmail.has(row.user_id)) {
            userIdToEmail.set(row.user_id, row.user_email)
          } else if (row.zeude_user_email && !userIdToEmail.has(row.user_id)) {
            userIdToEmail.set(row.user_id, row.zeude_user_email)
          }
        }

        // Fallback to Supabase for users still without email
        const stillNeedingLookup = Array.from(userIdsNeedingLookup).filter(id => !userIdToEmail.has(id))
        if (stillNeedingLookup.length > 0) {
          const supabase = createServerClient()
          const { data: users } = await supabase
            .from('zeude_users')
            .select('id, email')
            .in('id', stillNeedingLookup)

          if (users) {
            for (const user of users) {
              if (!userIdToEmail.has(user.id)) {
                userIdToEmail.set(user.id, user.email)
              }
            }
          }
        }
      }

      // Helper to get display name
      const getDisplayName = (userId: string, chEmail: string): string => {
        if (chEmail) return chEmail
        return userIdToEmail.get(userId) || userId || 'Unknown'
      }

      // Process users - cost comes directly from query
      const byUser: UserUsage[] = userData.map(row => {
        const inputTokens = parseInt(row.input_tokens) || 0
        const cacheReadTokens = parseInt(row.cache_read_tokens) || 0
        const cacheRate = inputTokens > 0 ? cacheReadTokens / inputTokens : 0

        return {
          userId: row.user_id || row.user_email,
          userName: getDisplayName(row.user_id, row.user_email),
          team: '',
          inputTokens,
          outputTokens: parseInt(row.output_tokens) || 0,
          cost: Math.round((parseFloat(row.cost) || 0) * 100) / 100,
          cacheHitRate: Math.round(cacheRate * 100) / 100,
          requestCount: parseInt(row.request_count) || 0,
        }
      })

      // Calculate cache hit rate
      const cacheHitRate = totalInput > 0 ? totalCacheRead / totalInput : 0

      const response: UsageResponse = {
        summary: {
          totalInputTokens: totalInput,
          totalOutputTokens: totalOutput,
          totalCost: Math.round(totalCost * 100) / 100,
          cacheHitRate: Math.round(cacheHitRate * 100) / 100,
          totalRequests,
        },
        byUser,
        trend,
      }

      return Response.json(response)
    } catch (chError) {
      console.error('ClickHouse query error:', chError)
      return Response.json(
        {
          error: 'Analytics query failed',
          message: 'Failed to query ClickHouse. Please check connection settings.',
        },
        { status: 503 }
      )
    }
  } catch (err) {
    console.error('Analytics usage error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
