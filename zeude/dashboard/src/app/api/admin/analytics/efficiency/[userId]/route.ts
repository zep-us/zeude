import { getSession } from '@/lib/session'
import { getClickHouseClient } from '@/lib/clickhouse'

interface ContextGrowthPoint {
  date: string
  sessionCount: number
  avgGrowthRate: number
  avgSessionLength: number
}

interface ToolUsage {
  tool: string
  requests: number
  inputTokens: number
  outputTokens: number
}

interface UserInsights {
  userId: string
  contextGrowth: ContextGrowthPoint[]
  toolUsage: ToolUsage[]
  sessionStats: {
    totalSessions: number
    avgSessionLength: number
    avgGrowthRate: number
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { userId } = await params
    const clickhouse = getClickHouseClient()

    if (!clickhouse) {
      // Return mock data for development
      return Response.json(generateMockInsights(userId))
    }

    try {
      // Query context growth over time
      const contextGrowthResult = await clickhouse.query({
        query: `
          SELECT
            toDate(date) as date,
            count() as session_count,
            avg(growth_rate) as avg_growth_rate,
            avg(session_length) as avg_session_length
          FROM context_growth_analysis
          WHERE user_id = {userId:String}
            AND date >= today() - INTERVAL 30 DAY
          GROUP BY date
          ORDER BY date
        `,
        query_params: { userId },
        format: 'JSONEachRow',
      })
      const contextGrowthData = (await contextGrowthResult.json()) as {
        date: string
        session_count: string
        avg_growth_rate: number
        avg_session_length: number
      }[]

      // Query tool (MCP server) usage
      const toolUsageResult = await clickhouse.query({
        query: `
          SELECT
            mcp_server as tool,
            sum(request_count) as requests,
            sum(input_tokens) as input_tokens,
            sum(output_tokens) as output_tokens
          FROM token_usage_hourly
          WHERE user_id = {userId:String}
            AND hour >= toStartOfHour(now() - INTERVAL 30 DAY)
            AND mcp_server != ''
          GROUP BY mcp_server
          ORDER BY requests DESC
          LIMIT 10
        `,
        query_params: { userId },
        format: 'JSONEachRow',
      })
      const toolUsageData = (await toolUsageResult.json()) as {
        tool: string
        requests: string
        input_tokens: string
        output_tokens: string
      }[]

      // Query overall session stats
      const sessionStatsResult = await clickhouse.query({
        query: `
          SELECT
            count() as total_sessions,
            avg(session_length) as avg_session_length,
            avg(growth_rate) as avg_growth_rate
          FROM context_growth_analysis
          WHERE user_id = {userId:String}
            AND date >= today() - INTERVAL 30 DAY
        `,
        query_params: { userId },
        format: 'JSONEachRow',
      })
      const sessionStatsData = (await sessionStatsResult.json()) as {
        total_sessions: string
        avg_session_length: number
        avg_growth_rate: number
      }[]

      const insights: UserInsights = {
        userId,
        contextGrowth: contextGrowthData.map(row => ({
          date: row.date,
          sessionCount: parseInt(row.session_count),
          avgGrowthRate: row.avg_growth_rate,
          avgSessionLength: row.avg_session_length,
        })),
        toolUsage: toolUsageData.map(row => ({
          tool: row.tool,
          requests: parseInt(row.requests),
          inputTokens: parseInt(row.input_tokens),
          outputTokens: parseInt(row.output_tokens),
        })),
        sessionStats: sessionStatsData[0] ? {
          totalSessions: parseInt(sessionStatsData[0].total_sessions),
          avgSessionLength: sessionStatsData[0].avg_session_length,
          avgGrowthRate: sessionStatsData[0].avg_growth_rate,
        } : {
          totalSessions: 0,
          avgSessionLength: 0,
          avgGrowthRate: 0,
        },
      }

      return Response.json(insights)
    } catch (chError) {
      console.error('ClickHouse query error:', chError)
      // Return mock data on error for development
      return Response.json(generateMockInsights(userId))
    }
  } catch (err) {
    console.error('User insights error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateMockInsights(userId: string): UserInsights {
  // Generate 30 days of mock data
  const contextGrowth: ContextGrowthPoint[] = []
  const today = new Date()

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    contextGrowth.push({
      date: date.toISOString().split('T')[0],
      sessionCount: Math.floor(Math.random() * 5) + 1,
      avgGrowthRate: 1 + Math.random() * 3,
      avgSessionLength: Math.floor(Math.random() * 20) + 5,
    })
  }

  const tools = ['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Write', 'WebSearch', 'Task']
  const toolUsage: ToolUsage[] = tools
    .slice(0, Math.floor(Math.random() * 5) + 3)
    .map(tool => ({
      tool,
      requests: Math.floor(Math.random() * 500) + 50,
      inputTokens: Math.floor(Math.random() * 100000) + 10000,
      outputTokens: Math.floor(Math.random() * 50000) + 5000,
    }))
    .sort((a, b) => b.requests - a.requests)

  return {
    userId,
    contextGrowth,
    toolUsage,
    sessionStats: {
      totalSessions: Math.floor(Math.random() * 50) + 10,
      avgSessionLength: Math.floor(Math.random() * 15) + 5,
      avgGrowthRate: 1 + Math.random() * 2,
    },
  }
}
