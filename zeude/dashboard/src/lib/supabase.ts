import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

// Client-side Supabase client (limited permissions)
export function createClient() {
  return createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

// Server-side Supabase client (full permissions)
export function createServerClient() {
  return createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

// Supabase 쿼리 에러가 DB 연결 문제(ETIMEDOUT, DNS 실패 등)인지 판별
export function isDBConnectionError(error: { message?: string; details?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = `${error.message || ''} ${error.details || ''}`
  return msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
}

// Re-export types for convenience
export type { User, OneTimeToken, Session } from './database.types'
