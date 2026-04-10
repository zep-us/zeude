import type { OperationalDb } from './types'
import { createOperationalDb } from './sqlite/repositories'
import { createSupabaseOperationalDb } from './supabase-adapter'

let cachedDb: OperationalDb | null = null

export function resolveOperationalDbProvider(
  nodeEnv = process.env.NODE_ENV,
  databaseProvider = process.env.DATABASE_PROVIDER
): 'sqlite' | 'supabase' {
  if (databaseProvider === 'sqlite' || databaseProvider === 'supabase') {
    return databaseProvider
  }

  return nodeEnv === 'test' ? 'supabase' : 'sqlite'
}

export function getOperationalDb(): OperationalDb {
  if (!cachedDb) {
    cachedDb = resolveOperationalDbProvider() === 'supabase'
      ? createSupabaseOperationalDb()
      : createOperationalDb()
  }
  return cachedDb
}
