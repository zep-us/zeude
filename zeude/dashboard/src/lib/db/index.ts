import type { OperationalDb } from './types'
import { createOperationalDb } from './sqlite/repositories'

let cachedDb: OperationalDb | null = null

export function getOperationalDb(): OperationalDb {
  if (!cachedDb) {
    cachedDb = createOperationalDb()
  }
  return cachedDb
}
