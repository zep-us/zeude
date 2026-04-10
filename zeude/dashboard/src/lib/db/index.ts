import type { OperationalDb } from './types'
import { createOperationalDb } from './sqlite/repositories'
import { createSupabaseOperationalDb } from './supabase-adapter'

let cachedDb: OperationalDb | null = null

export function getOperationalDb(): OperationalDb {
  if (!cachedDb) {
    cachedDb = process.env.NODE_ENV === 'test'
      ? createSupabaseOperationalDb()
      : createOperationalDb()
  }
  return cachedDb
}
