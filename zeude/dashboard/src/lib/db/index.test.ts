import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sqliteDb = { provider: 'sqlite' }

vi.mock('./sqlite/repositories', () => ({
  createOperationalDb: vi.fn(() => sqliteDb),
}))

describe('getOperationalDb', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('creates sqlite operational db', async () => {
    const { getOperationalDb } = await import('./index')
    const { createOperationalDb } = await import('./sqlite/repositories')

    expect(getOperationalDb()).toBe(sqliteDb)
    expect(createOperationalDb).toHaveBeenCalledTimes(1)
  })

  it('caches the sqlite operational db instance', async () => {
    const { getOperationalDb } = await import('./index')
    const { createOperationalDb } = await import('./sqlite/repositories')

    expect(getOperationalDb()).toBe(sqliteDb)
    expect(getOperationalDb()).toBe(sqliteDb)
    expect(createOperationalDb).toHaveBeenCalledTimes(1)
  })
})
