import { createClient, ClickHouseClient } from '@clickhouse/client'
import { unstable_cache } from 'next/cache'
import { env } from './env'

// Check if ClickHouse is explicitly configured (not just using defaults)
const isClickHouseConfigured = process.env.CLICKHOUSE_URL !== undefined

// Only create the client if CLICKHOUSE_URL is explicitly configured
let _clickhouseClient: ClickHouseClient | null = null

function initClickHouseClient(): ClickHouseClient | null {
  if (!isClickHouseConfigured) {
    return null
  }
  if (!_clickhouseClient) {
    _clickhouseClient = createClient({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DATABASE,
      request_timeout: 30000,
    })
  }
  return _clickhouseClient
}

// Get the ClickHouse client (returns null if not configured)
export function getClickHouseClient(): ClickHouseClient | null {
  return initClickHouseClient()
}

// Legacy export for backward compatibility
export const clickhouse = createClient({
  url: env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
  request_timeout: 30000,
})

// Types for telemetry data
export interface SessionSummary {
  session_id: string
  started_at: string
  ended_at: string
  event_count: number
  total_cost: number
  input_tokens: number
  output_tokens: number
}

export interface DailyStats {
  date: string
  sessions: number
  cost: number
  input_tokens: number
  output_tokens: number
}

// Query helpers
// Note: OTel schema uses Timestamp (capital), LogAttributes map with dot notation (user.email, session.id)
// For Bedrock users, email comes from ResourceAttributes['zeude.user.email'] instead of LogAttributes['user.email']

// Helper to build user matching condition (supports both Anthropic and Bedrock users)
// Matches by: user.email OR zeude.user.email OR zeude.user.id (Supabase UUID)
const USER_MATCH_CONDITION = `(
  LogAttributes['user.email'] = {userEmail:String}
  OR ResourceAttributes['zeude.user.email'] = {userEmail:String}
  OR ResourceAttributes['zeude.user.id'] = {userId:String}
)`

async function _getSessionsToday(userEmail: string, userId: string = ''): Promise<SessionSummary[]> {
  const result = await clickhouse.query({
    query: `
      SELECT
        LogAttributes['session.id'] as session_id,
        min(Timestamp) as started_at,
        max(Timestamp) as ended_at,
        count() as event_count,
        sum(toFloat64OrZero(LogAttributes['cost_usd'])) as total_cost,
        sum(toInt64OrZero(LogAttributes['input_tokens'])) as input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens
      FROM claude_code_logs
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today()
      GROUP BY session_id
      HAVING session_id != ''
      ORDER BY started_at DESC
    `,
    query_params: { userEmail, userId },
    format: 'JSONEachRow',
  })
  return result.json()
}

// 30초 캐싱으로 반복 요청 시 DB 부하 감소
export const getSessionsToday = unstable_cache(
  _getSessionsToday,
  ['sessions-today'],
  { revalidate: 30 }
)

async function _getDailyStats(userEmail: string, userId: string = '', days: number = 30): Promise<DailyStats[]> {
  const result = await clickhouse.query({
    query: `
      SELECT
        toDate(Timestamp) as date,
        count(DISTINCT LogAttributes['session.id']) as sessions,
        sum(toFloat64OrZero(LogAttributes['cost_usd'])) as cost,
        sum(toInt64OrZero(LogAttributes['input_tokens'])) as input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens
      FROM claude_code_logs
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today() - {days:Int32}
      GROUP BY date
      ORDER BY date DESC
    `,
    query_params: { userEmail, userId, days },
    format: 'JSONEachRow',
  })
  return result.json()
}

// 60초 캐싱 (일별 데이터는 자주 변하지 않음)
export const getDailyStats = unstable_cache(
  _getDailyStats,
  ['daily-stats'],
  { revalidate: 60 }
)

export interface OverviewStats {
  total_sessions: number
  total_cost: number
  total_input_tokens: number
  total_output_tokens: number
}

const defaultOverviewStats: OverviewStats = {
  total_sessions: 0,
  total_cost: 0,
  total_input_tokens: 0,
  total_output_tokens: 0
}

async function _getOverviewStats(userEmail: string, userId: string = ''): Promise<OverviewStats> {
  const result = await clickhouse.query({
    query: `
      SELECT
        count(DISTINCT LogAttributes['session.id']) as total_sessions,
        sum(toFloat64OrZero(LogAttributes['cost_usd'])) as total_cost,
        sum(toInt64OrZero(LogAttributes['input_tokens'])) as total_input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as total_output_tokens
      FROM claude_code_logs
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today()
    `,
    query_params: { userEmail, userId },
    format: 'JSONEachRow',
  })
  const rows = (await result.json()) as OverviewStats[]
  if (rows.length === 0) {
    return defaultOverviewStats
  }
  return rows[0]
}

// 30초 캐싱
export const getOverviewStats = unstable_cache(
  _getOverviewStats,
  ['overview-stats'],
  { revalidate: 30 }
)

export async function getSessionDetails(userEmail: string, userId: string, sessionId: string) {
  const result = await clickhouse.query({
    query: `
      SELECT
        Timestamp as timestamp,
        Body as event_name,
        LogAttributes as attributes
      FROM claude_code_logs
      WHERE ${USER_MATCH_CONDITION}
        AND LogAttributes['session.id'] = {sessionId:String}
      ORDER BY Timestamp ASC
    `,
    query_params: { userEmail, userId, sessionId },
    format: 'JSONEachRow',
  })
  return result.json()
}
