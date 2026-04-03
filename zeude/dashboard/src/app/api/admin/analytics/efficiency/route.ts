import { getSession } from '@/lib/session'
import { getClickHouseClient, buildMVSourceCondition, parseSourceParam } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { calculateEfficiencyScore } from '@/lib/efficiency'
import { resolveUserNames } from '@/lib/name-resolution'

interface UserEfficiency {
  userId: string
  userName: string
  cacheHitRate: number
  avgInputPerRequest: number
  contextGrowthRate: number
  retryDensity: number
  efficiencyScore: number
  costEfficiency: number
  workQuality: number
  contextEfficiency: number
  cacheEfficiency: number
  requestsPerDollar: number
  tips: string[]
}

interface EfficiencyResponse {
  byUser: UserEfficiency[]
}

interface UnifiedUserData {
  user_id: string
  user_email: string | null
  output_tokens: string
  cost_usd: number
  request_count: string
  cache_read_tokens: string
  input_tokens: string
  retry_density: number
  growth_rate: number
}

// Efficiency thresholds
const THRESHOLDS = {
  cacheHitRate: { good: 0.85, warning: 0.60 },
  // avgInputPerRequest removed: high input with context is GOOD, not bad
  contextGrowthRate: { good: 2, warning: 5 },
  retryDensity: { good: 0.10, warning: 0.20 },
}

// GET: Fetch efficiency metrics
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
    const source = parseSourceParam(searchParams.get('source'))
    const sourceFilter = buildMVSourceCondition(source)

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
      // Unified query with LEFT JOINs to get all metrics in one query
      const result = await clickhouse.query({
        query: `
          SELECT
            t.user_id as user_id,
            t.user_email as user_email,
            t.output_tokens,
            t.cost_usd,
            t.request_count,
            t.cache_read_tokens,
            t.input_tokens,
            coalesce(r.avg_retry_density, 0.10) as retry_density,
            coalesce(c.avg_growth_rate, 2.0) as growth_rate
          FROM (
            SELECT user_id, any(user_email) as user_email,
              sum(output_tokens) as output_tokens,
              sum(cost_usd) as cost_usd,
              sum(request_count) as request_count,
              sum(cache_read_tokens) as cache_read_tokens,
              sum(input_tokens) as input_tokens
            FROM token_usage_hourly
            WHERE hour >= now() - INTERVAL 7 DAY
              ${sourceFilter}
            GROUP BY user_id
          ) t
          LEFT JOIN (
            SELECT user_id, avg(retry_density) as avg_retry_density
            FROM retry_analysis
            WHERE date >= today() - 7
              ${sourceFilter}
            GROUP BY user_id
          ) r ON t.user_id = r.user_id
          LEFT JOIN (
            SELECT user_id, avg(growth_rate) as avg_growth_rate
            FROM context_growth_analysis
            WHERE date >= today() - 7
              ${sourceFilter}
            GROUP BY user_id
          ) c ON t.user_id = c.user_id
        `,
        format: 'JSONEachRow',
      })
      const userData = (await result.json()) as UnifiedUserData[]

      // === Name Resolution (Zeude Identity SSOT) ===
      // Shared utility handles Supabase lookup + email fallback + error handling
      const supabase = createServerClient()
      const { getDisplayName } = await resolveUserNames(supabase, userData)

      const byUser: UserEfficiency[] = userData.map(row => {
        const inputTokens = parseInt(row.input_tokens) || 0
        const cacheReadTokens = parseInt(row.cache_read_tokens) || 0
        const requestCount = parseInt(row.request_count) || 0
        const outputTokens = parseInt(row.output_tokens) || 0
        const costUsd = row.cost_usd || 0

        const cacheHitRate = inputTokens > 0 ? cacheReadTokens / inputTokens : 0
        const avgInputPerRequest = requestCount > 0 ? inputTokens / requestCount : 0
        const contextGrowthRate = row.growth_rate
        const retryDensity = row.retry_density
        const userName = getDisplayName(row.user_id, row.user_email)

        return generateUserEfficiency(
          row.user_id,
          userName,
          cacheHitRate,
          avgInputPerRequest,
          contextGrowthRate,
          retryDensity,
          outputTokens,
          costUsd,
          cacheReadTokens,
          requestCount
        )
      })

      return Response.json({ byUser })
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
    console.error('Analytics efficiency error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateUserEfficiency(
  userId: string,
  userName: string,
  cacheHitRate: number,
  avgInputPerRequest: number,
  contextGrowthRate: number,
  retryDensity: number,
  outputTokens: number,
  costUsd: number,
  cacheReadTokens: number,
  requestCount: number
): UserEfficiency {
  const tips: string[] = []

  // Generate tips based on metrics
  if (cacheHitRate < THRESHOLDS.cacheHitRate.warning) {
    tips.push('Keep sessions longer to benefit from prompt caching')
  } else if (cacheHitRate < THRESHOLDS.cacheHitRate.good) {
    tips.push('Consider extending session duration for better cache hit rates')
  }

  // Note: avgInputPerRequest no longer generates warnings
  // High input with good context is actually beneficial

  if (contextGrowthRate > THRESHOLDS.contextGrowthRate.warning) {
    tips.push('Use /compact regularly to manage context growth')
  } else if (contextGrowthRate > THRESHOLDS.contextGrowthRate.good) {
    tips.push('Consider starting new sessions after 10-30 requests')
  }

  if (retryDensity > THRESHOLDS.retryDensity.warning) {
    tips.push('Write clearer, more specific prompts to reduce retries')
  } else if (retryDensity > THRESHOLDS.retryDensity.good) {
    tips.push('Review prompt patterns that lead to retries')
  }

  // Calculate efficiency score using shared utility with new metrics
  const {
    efficiencyScore,
    costEfficiency,
    workQuality,
    contextEfficiency,
    cacheEfficiency = 0,
    requestsPerDollar = 0
  } = calculateEfficiencyScore({
    retryDensity,
    growthRate: contextGrowthRate,
    outputTokens,
    costUsd,
    cacheReadTokens,
    requestCount,
  })

  return {
    userId,
    userName,
    cacheHitRate,
    avgInputPerRequest,
    contextGrowthRate,
    retryDensity,
    efficiencyScore,
    costEfficiency,
    workQuality,
    contextEfficiency,
    cacheEfficiency,
    requestsPerDollar,
    tips,
  }
}
