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

// Determine if a Supabase query error is a DB connection issue (ETIMEDOUT, DNS failure, etc.)
export function isDBConnectionError(error: { message?: string; details?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = `${error.message || ''} ${error.details || ''}`
  return msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
}

// Re-export types for convenience
export type { User, OneTimeToken, Session } from './database.types'
