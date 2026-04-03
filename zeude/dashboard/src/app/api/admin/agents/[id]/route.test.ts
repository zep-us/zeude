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
  return new Request('http://localhost/api/admin/agents/some-id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/agents/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest({}), makeParams('id-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await PATCH(makePatchRequest({}), makeParams('id-1'))
    expect(res.status).toBe(403)
  })

  // AC-30: Name validation if provided
  it('returns 400 when name is empty string', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ name: '' }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Name cannot be empty')
  })

  it('returns 400 when name exceeds 64 characters', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ name: 'a'.repeat(65) }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('64 characters or less')
  })

  it('returns 400 when name has invalid format', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ name: 'Invalid-Name-123' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('accepts valid kebab-case name update', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'id-1', name: 'new-name' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const res = await PATCH(makePatchRequest({ name: 'new-name' }), makeParams('id-1'))
    expect(res.status).toBe(200)
  })

  // Files validation on PATCH
  it('returns 400 when files is an array', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ files: ['bad'] }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files must be an object')
  })

  it('returns 400 when files is empty', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ files: {} }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('At least one file is required')
  })

  it('returns 400 when files contain invalid paths', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ files: { '/etc/passwd': 'bad' } }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid file path')
  })

  it('accepts valid files update', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updatedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updatedData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'id-1', ...data }, error: null }),
            }),
          }),
        }
      }),
    })

    const files = { 'AGENT.md': '# Updated agent', 'lib/utils.ts': 'export const x = 1' }
    const res = await PATCH(makePatchRequest({ files }), makeParams('id-1'))
    expect(res.status).toBe(200)
    expect(updatedData.files).toEqual(files)
  })

  // AC-31/AC-91: Global->Non-global requires teams
  it('returns 400 when setting isGlobal=false without teams', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ isGlobal: false }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Teams must be specified when disabling global access')
  })

  it('allows setting isGlobal=false with teams', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'id-1', is_global: false, teams: ['team-a'] },
              error: null,
            }),
          }),
        }),
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: false, teams: ['team-a'] }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(200)
  })

  it('clears teams when setting isGlobal=true', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updatedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updatedData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'id-1', ...data }, error: null }),
            }),
          }),
        }
      }),
    })

    const res = await PATCH(
      makePatchRequest({ isGlobal: true }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(200)
    expect(updatedData.is_global).toBe(true)
    expect(updatedData.teams).toEqual([])
  })

  // DB error codes
  it('returns 400 for duplicate name (23505)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            }),
          }),
        }),
      }),
    })

    const res = await PATCH(
      makePatchRequest({ name: 'taken-name' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('name already exists')
  })

  it('returns 400 for check constraint violation (23514)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23514', message: 'check constraint' },
            }),
          }),
        }),
      }),
    })

    const res = await PATCH(
      makePatchRequest({ description: 'Updated' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('name format and files size')
  })

  // Only update provided fields
  it('only includes provided fields in update', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let updatedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updatedData = data
        return {
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'id-1', ...data }, error: null }),
            }),
          }),
        }
      }),
    })

    await PATCH(
      makePatchRequest({ description: 'New description' }),
      makeParams('id-1'),
    )

    expect(updatedData.description).toBe('New description')
    expect(updatedData).not.toHaveProperty('name')
    expect(updatedData).not.toHaveProperty('files')
    expect(updatedData).not.toHaveProperty('status')
  })
})

// AC-32: Delete by ID
describe('DELETE /api/admin/agents/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const req = new Request('http://localhost/api/admin/agents/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const req = new Request('http://localhost/api/admin/agents/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(403)
  })

  it('returns 200 on successful delete', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const req = new Request('http://localhost/api/admin/agents/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('returns 500 on delete failure', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      }),
    })

    const req = new Request('http://localhost/api/admin/agents/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(500)
  })
})
