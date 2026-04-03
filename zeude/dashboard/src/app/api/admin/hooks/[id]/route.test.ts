import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from './route'

// Mock dependencies
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '@/lib/session'

const mockGetSession = vi.mocked(getSession)

function adminSession() {
  return { user: { id: 'user-1', role: 'admin', email: 'admin@test.com' } }
}

function memberSession() {
  return { user: { id: 'user-2', role: 'member', email: 'member@test.com' } }
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/hooks/hook-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(): Request {
  return new Request('http://localhost/api/admin/hooks/hook-1', {
    method: 'DELETE',
  })
}

function mockSuccessfulUpdate(data: Record<string, unknown> = {}) {
  mockFrom.mockReturnValue({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'hook-1', name: 'test-hook', ...data },
            error: null,
          }),
        }),
      }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/hooks/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest({ name: 'test' }), makeParams('hook-1'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Not authenticated')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await PATCH(makePatchRequest({ name: 'test' }), makeParams('hook-1'))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 400 for invalid event', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ event: 'InvalidEvent' }), makeParams('hook-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid event')
  })

  it('accepts valid event types', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockSuccessfulUpdate({ event: 'PreToolUse' })

    const res = await PATCH(makePatchRequest({ event: 'PreToolUse' }), makeParams('hook-1'))
    expect(res.status).toBe(200)
  })

  it('returns 400 when script exceeds max size', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const largeScript = 'x'.repeat(100 * 1024 + 1)
    const res = await PATCH(makePatchRequest({ scriptContent: largeScript }), makeParams('hook-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Script too large')
  })

  it('updates name successfully', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockSuccessfulUpdate({ name: 'updated-hook' })

    const res = await PATCH(makePatchRequest({ name: 'updated-hook' }), makeParams('hook-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.hook.name).toBe('updated-hook')
  })

  // AC-97: isGlobal true → teams cleared to []
  it('clears teams when isGlobal is set to true', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updateData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updateData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'hook-1', is_global: true, teams: [] },
                error: null,
              }),
            }),
          }),
        }
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: true, teams: ['team-a', 'team-b'] }),
      makeParams('hook-1')
    )
    expect(res.status).toBe(200)
    expect(updateData.is_global).toBe(true)
    expect(updateData.teams).toEqual([])
  })

  // AC-97: Unlike skills and agents, hooks do NOT require teams when disabling global access.
  // When isGlobal is set to false without providing teams, hooks should succeed (200),
  // NOT return 400. This is an INTENTIONAL INCONSISTENCY — hooks have simpler scoping
  // requirements than skills/agents.
  it('succeeds when isGlobal is false without teams (intentional difference from skills/agents)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updateData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updateData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'hook-1', is_global: false, teams: [] },
                error: null,
              }),
            }),
          }),
        }
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: false }),
      makeParams('hook-1')
    )
    // Hooks do NOT require teams when switching from global to non-global
    expect(res.status).toBe(200)
    expect(updateData.is_global).toBe(false)
  })

  it('passes teams when isGlobal is false and teams are provided', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updateData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updateData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'hook-1', is_global: false, teams: ['team-a'] },
                error: null,
              }),
            }),
          }),
        }
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: false, teams: ['team-a'] }),
      makeParams('hook-1')
    )
    expect(res.status).toBe(200)
    expect(updateData.is_global).toBe(false)
    expect(updateData.teams).toEqual(['team-a'])
  })

  it('ignores teams when isGlobal is true even if teams provided', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updateData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updateData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'hook-1', is_global: true, teams: [] },
                error: null,
              }),
            }),
          }),
        }
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: true, teams: ['team-x'] }),
      makeParams('hook-1')
    )
    expect(res.status).toBe(200)
    expect(updateData.teams).toEqual([])
    expect(updateData).not.toHaveProperty('teams', ['team-x'])
  })
})

describe('DELETE /api/admin/hooks/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await DELETE(makeDeleteRequest(), makeParams('hook-1'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Not authenticated')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await DELETE(makeDeleteRequest(), makeParams('hook-1'))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('deletes hook successfully', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const res = await DELETE(makeDeleteRequest(), makeParams('hook-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
