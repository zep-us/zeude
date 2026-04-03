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

// Source filter type for Claude Code vs Codex filtering
export type SourceFilter = 'all' | 'claude' | 'codex'

// Query helpers
// Note: OTel schema uses Timestamp (capital), LogAttributes map with dot notation (user.email, session.id)
// For Bedrock users, email comes from ResourceAttributes['zeude.user.email'] instead of LogAttributes['user.email']

// Helper to build user matching condition (supports both Anthropic and Bedrock users)
// Zeude identity is SSOT; external source IDs (Claude, Codex) are last-resort fallback
const USER_MATCH_CONDITION = `(
  ResourceAttributes['zeude.user.id'] = {userId:String}
  OR ResourceAttributes['zeude.user.email'] = {userEmail:String}
  OR LogAttributes['user.email'] = {userEmail:String}
)`

// Helper to build source filter condition for claude_code_logs (raw log table).
// Uses ServiceName column: Codex services always start with 'codex' prefix
// (e.g. 'codex', 'codex_cli_rs'). Everything else is treated as 'claude'.
function buildSourceCondition(source: SourceFilter): string {
  if (source === 'claude') return "AND NOT (ServiceName ILIKE 'codex%')"
  if (source === 'codex') return "AND ServiceName ILIKE 'codex%'"
  return '' // 'all' = no filter
}

// Helper to build source filter condition for materialized views (token_usage_hourly, etc.).
// Uses the pre-computed 'source' column (not ServiceName).
export function buildMVSourceCondition(source: SourceFilter): string {
  if (source === 'claude') return "AND source = 'claude'"
  if (source === 'codex') return "AND source = 'codex'"
  return '' // 'all' = no filter
}

// Validate and sanitize source parameter from URL search params.
export function parseSourceParam(value: string | null): SourceFilter {
  if (value === 'claude' || value === 'codex') return value
  return 'all'
}

// Escape a string value for safe interpolation in ClickHouse SQL.
// Only use for values that cannot be parameterized (e.g., dynamic column names).
export function escapeClickHouseString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

// Pricing model JOIN clause for accurate cost calculation.
// Codex logs have cost_usd=0, so we JOIN pricing_model to compute cost
// from token counts. Falls back to LogAttributes['cost_usd'] when model
// is not found in pricing_model (e.g. Claude Code which includes cost).
const PRICING_JOIN = `
LEFT JOIN (
  SELECT model_id,
    argMax(input_price_per_million, effective_date) as input_price,
    argMax(output_price_per_million, effective_date) as output_price,
    argMax(cache_read_price_per_million, effective_date) as cache_read_price,
    argMax(cache_creation_price_per_million, effective_date) as cache_creation_price
  FROM pricing_model GROUP BY model_id
) pm ON LogAttributes['model'] = pm.model_id`

// Normalize input tokens for display: Codex reports full context (new + cached),
// while Claude Code reports only new tokens. Subtract cache for Codex to make
// the numbers comparable. Cost calculation (COST_EXPR) still uses full tokens.
const INPUT_TOKENS_EXPR = `sum(
  if(ServiceName ILIKE 'codex%',
    toInt64OrZero(LogAttributes['input_tokens']) - toInt64OrZero(LogAttributes['cache_read_tokens']),
    toInt64OrZero(LogAttributes['input_tokens'])
  )
)`

const COST_EXPR = `sum(
  if(pm.model_id != '',
    toInt64OrZero(LogAttributes['input_tokens']) * pm.input_price / 1000000.0
    + toInt64OrZero(LogAttributes['output_tokens']) * pm.output_price / 1000000.0
    + toInt64OrZero(LogAttributes['cache_read_tokens']) * pm.cache_read_price / 1000000.0
    + toInt64OrZero(LogAttributes['cache_creation_tokens']) * pm.cache_creation_price / 1000000.0,
    toFloat64OrZero(LogAttributes['cost_usd'])
  )
)`

async function _getSessionsToday(userEmail: string, userId: string = '', source: SourceFilter = 'all'): Promise<SessionSummary[]> {
  const sourceCondition = buildSourceCondition(source)
  const result = await clickhouse.query({
    query: `
      SELECT
        LogAttributes['session.id'] as session_id,
        min(Timestamp) as started_at,
        max(Timestamp) as ended_at,
        count() as event_count,
        ${COST_EXPR} as total_cost,
        ${INPUT_TOKENS_EXPR} as input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens
      FROM claude_code_logs
      ${PRICING_JOIN}
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today()
        ${sourceCondition}
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
// Cache key includes all dynamic params to prevent collisions across different users/sources
export function getSessionsToday(userEmail: string, userId: string = '', source: SourceFilter = 'all'): Promise<SessionSummary[]> {
  const cacheKey = ['sessions-today', userEmail, userId, source]
  return unstable_cache(_getSessionsToday, cacheKey, { revalidate: 30 })(userEmail, userId, source)
}

async function _getDailyStats(userEmail: string, userId: string = '', days: number = 30, source: SourceFilter = 'all'): Promise<DailyStats[]> {
  const sourceCondition = buildSourceCondition(source)
  const result = await clickhouse.query({
    query: `
      SELECT
        toDate(Timestamp) as date,
        count(DISTINCT LogAttributes['session.id']) as sessions,
        ${COST_EXPR} as cost,
        ${INPUT_TOKENS_EXPR} as input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as output_tokens
      FROM claude_code_logs
      ${PRICING_JOIN}
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today() - {days:Int32}
        ${sourceCondition}
      GROUP BY date
      ORDER BY date DESC
    `,
    query_params: { userEmail, userId, days },
    format: 'JSONEachRow',
  })
  return result.json()
}

// 60초 캐싱 (일별 데이터는 자주 변하지 않음)
export function getDailyStats(userEmail: string, userId: string = '', days: number = 30, source: SourceFilter = 'all'): Promise<DailyStats[]> {
  const cacheKey = ['daily-stats', userEmail, userId, String(days), source]
  return unstable_cache(_getDailyStats, cacheKey, { revalidate: 60 })(userEmail, userId, days, source)
}

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

async function _getOverviewStats(userEmail: string, userId: string = '', source: SourceFilter = 'all'): Promise<OverviewStats> {
  const sourceCondition = buildSourceCondition(source)
  const result = await clickhouse.query({
    query: `
      SELECT
        count(DISTINCT LogAttributes['session.id']) as total_sessions,
        ${COST_EXPR} as total_cost,
        ${INPUT_TOKENS_EXPR} as total_input_tokens,
        sum(toInt64OrZero(LogAttributes['output_tokens'])) as total_output_tokens
      FROM claude_code_logs
      ${PRICING_JOIN}
      WHERE ${USER_MATCH_CONDITION}
        AND Timestamp >= today()
        ${sourceCondition}
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
export function getOverviewStats(userEmail: string, userId: string = '', source: SourceFilter = 'all'): Promise<OverviewStats> {
  const cacheKey = ['overview-stats', userEmail, userId, source]
  return unstable_cache(_getOverviewStats, cacheKey, { revalidate: 30 })(userEmail, userId, source)
}

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
