import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sqliteDb = { provider: 'sqlite' }
const supabaseDb = { provider: 'supabase' }

vi.mock('./sqlite/repositories', () => ({
  createOperationalDb: vi.fn(() => sqliteDb),
}))

vi.mock('./supabase-adapter', () => ({
  createSupabaseOperationalDb: vi.fn(() => supabaseDb),
}))

describe('getOperationalDb', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    const testEnv = process.env as Record<string, string | undefined>
    delete testEnv.DATABASE_PROVIDER
    delete testEnv.NODE_ENV
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses sqlite when DATABASE_PROVIDER=sqlite', async () => {
    process.env.DATABASE_PROVIDER = 'sqlite'

    const { getOperationalDb } = await import('./index')
    const { createOperationalDb } = await import('./sqlite/repositories')
    const { createSupabaseOperationalDb } = await import('./supabase-adapter')

    expect(getOperationalDb()).toBe(sqliteDb)
    expect(createOperationalDb).toHaveBeenCalledTimes(1)
    expect(createSupabaseOperationalDb).not.toHaveBeenCalled()
  })

  it('uses supabase when DATABASE_PROVIDER=supabase', async () => {
    process.env.DATABASE_PROVIDER = 'supabase'

    const { getOperationalDb } = await import('./index')
    const { createOperationalDb } = await import('./sqlite/repositories')
    const { createSupabaseOperationalDb } = await import('./supabase-adapter')

    expect(getOperationalDb()).toBe(supabaseDb)
    expect(createSupabaseOperationalDb).toHaveBeenCalledTimes(1)
    expect(createOperationalDb).not.toHaveBeenCalled()
  })

  it('defaults tests to supabase when DATABASE_PROVIDER is unset', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'

    const { getOperationalDb } = await import('./index')
    const { createOperationalDb } = await import('./sqlite/repositories')
    const { createSupabaseOperationalDb } = await import('./supabase-adapter')

    expect(getOperationalDb()).toBe(supabaseDb)
    expect(createSupabaseOperationalDb).toHaveBeenCalledTimes(1)
    expect(createOperationalDb).not.toHaveBeenCalled()
  })
})
