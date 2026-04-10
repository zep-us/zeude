import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { env } from '@/lib/env'
import { migrateSqlite } from './migrator'

let dbInstance: Database.Database | null = null

function resolveDatabasePath() {
  if (env.DATABASE_PATH) {
    return env.DATABASE_PATH
  }

  if (env.NODE_ENV === 'production') {
    return '/var/lib/zeude/zeude.db'
  }

  return path.join(process.cwd(), '.data', 'zeude.db')
}

export function getSqlite() {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = resolveDatabasePath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')
  dbInstance.pragma('busy_timeout = 5000')

  migrateSqlite(dbInstance)

  return dbInstance
}
