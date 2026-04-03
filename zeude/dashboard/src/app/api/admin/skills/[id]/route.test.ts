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
  return new Request('http://localhost/api/admin/skills/some-id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/skills/[id]', () => {
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

  // Slug validation
  it('returns 400 for invalid slug format', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ slug: 'BAD SLUG!' }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  // AC-105: Content updates for backward compat
  it('returns 400 when content exceeds MAX_CONTENT_SIZE', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const oversizedContent = 'x'.repeat(100 * 1024 + 1)
    const res = await PATCH(makePatchRequest({ content: oversizedContent }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Content too large')
    expect(json.error).toContain('100KB')
  })

  // AC-24: Both content and files updatable
  it('allows updating content for backward compat', async () => {
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
      makePatchRequest({ content: '# Updated content' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(200)
    expect(updatedData.content).toBe('# Updated content')
  })

  // AC-8/AC-89: PATCH files requires SKILL.md
  it('returns 400 when files is provided without SKILL.md', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ files: { 'other.md': 'content' } }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files must include SKILL.md')
  })

  it('returns 400 when files is an empty object', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ files: {} }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('At least one file is required')
  })

  it('returns 400 when files is an array', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(makePatchRequest({ files: ['bad'] }), makeParams('id-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files must be an object')
  })

  it('returns 400 when files contain invalid paths', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ files: { 'SKILL.md': 'ok', '../bad': 'bad' } }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid file path')
  })

  it('accepts valid files update with SKILL.md', async () => {
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

    const files = { 'SKILL.md': '# Updated', 'lib/helper.ts': 'export const x = 1' }
    const res = await PATCH(makePatchRequest({ files }), makeParams('id-1'))
    expect(res.status).toBe(200)
    expect(updatedData.files).toEqual(files)
  })

  // AC-9/AC-90: Global->Non-global requires teams
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

  // Keyword validation
  it('returns 400 when primaryKeywords is not an array of strings', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ primaryKeywords: [1, 2, 3] }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('primaryKeywords must be an array of strings')
  })

  it('returns 400 when secondaryKeywords is not an array of strings', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await PATCH(
      makePatchRequest({ secondaryKeywords: 'not-an-array' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('secondaryKeywords must be an array of strings')
  })

  // DB error codes
  it('returns 400 for duplicate slug (23505)', async () => {
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
      makePatchRequest({ slug: 'taken-slug' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('slug already exists')
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
      makePatchRequest({ name: 'Updated' }),
      makeParams('id-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('files size')
  })
})

describe('DELETE /api/admin/skills/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const req = new Request('http://localhost/api/admin/skills/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const req = new Request('http://localhost/api/admin/skills/id-1', { method: 'DELETE' })
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

    const req = new Request('http://localhost/api/admin/skills/id-1', { method: 'DELETE' })
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

    const req = new Request('http://localhost/api/admin/skills/id-1', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('id-1'))
    expect(res.status).toBe(500)
  })
})
