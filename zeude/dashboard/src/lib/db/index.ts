import type { OperationalDb } from './types'
import { createOperationalDb } from './sqlite/repositories'

let cachedDb: OperationalDb | null = null

export function resolveOperationalDbProvider(
  databaseProvider = process.env.DATABASE_PROVIDER
): 'sqlite' {
  if (databaseProvider === 'supabase') {
    throw new Error('DATABASE_PROVIDER=supabase is no longer supported at runtime. Supabase remains migration-only.')
  }

  if (databaseProvider === 'sqlite') {
    return databaseProvider
  }

  return 'sqlite'
}

export function getOperationalDb(): OperationalDb {
  if (!cachedDb) {
    resolveOperationalDbProvider()
    cachedDb = createOperationalDb()
  }
  return cachedDb
}
