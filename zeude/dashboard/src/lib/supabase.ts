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

// Re-export types for convenience
export type { User, OneTimeToken, Session } from './database.types'
