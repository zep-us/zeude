import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, GET, DELETE } from './route'

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

vi.mock('@/lib/clickhouse', () => ({
  getClickHouseClient: vi.fn(() => null),
}))

import { getSession } from '@/lib/session'

const mockGetSession = vi.mocked(getSession)

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const ADMIN_UUID = 'a50e8400-e29b-41d4-a716-446655440001'

function adminSession() {
  return { user: { id: ADMIN_UUID, role: 'admin', email: 'admin@test.com' } }
}

function memberSession() {
  return { user: { id: 'user-2', role: 'member', email: 'member@test.com' } }
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/users/id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/users/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest({ team: 'eng' }), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Not authenticated')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'eng' }), makeParams(VALID_UUID))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 400 for invalid UUID', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'eng' }), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid user ID format')
  })

  it('returns 400 when no valid fields provided', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ foo: 'bar' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('No valid fields to update')
  })

  // AC-87: PostgREST injection prevention — valid team names pass through
  it('accepts valid team name: engineering', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: VALID_UUID, email: 'u@test.com', team: 'engineering', role: 'member', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    }))

    const res = await PATCH(makePatchRequest({ team: 'engineering' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: team-alpha', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: VALID_UUID, email: 'u@test.com', team: 'team-alpha', role: 'member', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    }))

    const res = await PATCH(makePatchRequest({ team: 'team-alpha' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: QA_team', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: VALID_UUID, email: 'u@test.com', team: 'QA_team', role: 'member', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    }))

    const res = await PATCH(makePatchRequest({ team: 'QA_team' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: Team123', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: VALID_UUID, email: 'u@test.com', team: 'Team123', role: 'member', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    }))

    const res = await PATCH(makePatchRequest({ team: 'Team123' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
  })

  // AC-87: PostgREST injection prevention — rejected team names
  it('rejects team name with dot (PostgREST .or() injection)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'team.name' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with comma (PostgREST operator injection)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'team,or.eq.role,admin' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with parentheses', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'team(evil)' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with semicolon', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'team;drop' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with space', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ team: 'team name' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  // Role validation
  it('returns 400 for invalid role', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ role: 'superadmin' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Role must be admin or member')
  })

  // Self-protection
  it('prevents admin from demoting themselves', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
    }))
    const res = await PATCH(makePatchRequest({ role: 'member' }), makeParams(ADMIN_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Cannot demote yourself')
  })

  it('prevents admin from deactivating themselves', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      }),
    }))
    const res = await PATCH(makePatchRequest({ status: 'inactive' }), makeParams(ADMIN_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Cannot deactivate yourself')
  })
})
