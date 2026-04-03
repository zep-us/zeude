import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from './route'

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

vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: vi.fn(() => 'a'.repeat(64)),
  })),
}))

import { getSession } from '@/lib/session'

const mockGetSession = vi.mocked(getSession)

function adminSession() {
  return { user: { id: 'user-1', role: 'admin', email: 'admin@test.com' } }
}

function memberSession() {
  return { user: { id: 'user-2', role: 'member', email: 'member@test.com' } }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/invites', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ team: 'engineering' }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Not authenticated')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await POST(makeRequest({ team: 'engineering' }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 400 when team is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ role: 'member' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Team is required')
  })

  it('returns 400 when team is not a string', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 123 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Team is required')
  })

  it('returns 400 when team is empty string', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: '' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Team is required')
  })

  // AC-86: PostgREST injection prevention — valid team names
  it('accepts valid team name: engineering', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { token: 'a'.repeat(64), team: 'engineering', role: 'member', expires_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({ team: 'engineering' }))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: team-alpha', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { token: 'a'.repeat(64), team: 'team-alpha', role: 'member', expires_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({ team: 'team-alpha' }))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: QA_team', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { token: 'a'.repeat(64), team: 'QA_team', role: 'member', expires_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({ team: 'QA_team' }))
    expect(res.status).toBe(200)
  })

  it('accepts valid team name: Team123', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { token: 'a'.repeat(64), team: 'Team123', role: 'member', expires_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({ team: 'Team123' }))
    expect(res.status).toBe(200)
  })

  // AC-7: PostgREST injection prevention — rejected team names
  it('rejects team name with dot (PostgREST .or() injection)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'team.name' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with comma (PostgREST operator injection)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'team,or.eq.role,admin' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with parentheses', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'team(evil)' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with semicolon', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'team;drop' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  it('rejects team name with space', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'team name' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('letters, numbers, hyphens, and underscores')
  })

  // Role validation
  it('returns 400 for invalid role', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ team: 'engineering', role: 'superadmin' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Role must be admin or member')
  })

  it('defaults role to member', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let insertedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { token: 'a'.repeat(64), team: 'engineering', role: 'member', expires_at: new Date().toISOString() },
              error: null,
            }),
          }),
        }
      }),
    })

    await POST(makeRequest({ team: 'engineering' }))
    expect(insertedData.role).toBe('member')
  })
})

describe('GET /api/admin/invites', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Not authenticated')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await GET()
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns invites on success', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const mockInvites = [{ id: '1', token: 'abc', team: 'engineering' }]

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: mockInvites, error: null }),
        }),
      }),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.invites).toEqual(mockInvites)
  })
})
