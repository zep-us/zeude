import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

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

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns agents and teams on success', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const mockAgents = [{ id: '1', name: 'code-critic', description: 'Review agent' }]
    const mockTeams = [{ team: 'frontend' }]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'zeude_agents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockAgents, error: null }),
          }),
        }
      }
      if (table === 'zeude_users') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockTeams, error: null }),
          }),
        }
      }
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toEqual(mockAgents)
    expect(json.teams).toEqual(['frontend'])
  })
})

describe('POST /api/admin/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ name: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await POST(makeRequest({ name: 'test' }))
    expect(res.status).toBe(403)
  })

  // AC-27: Name format validation
  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ files: { 'agent.md': 'content' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Name is required')
  })

  it('returns 400 when name exceeds 64 characters', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const longName = 'a'.repeat(65)
    const res = await POST(makeRequest({
      name: longName,
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('64 characters or less')
  })

  it('accepts name at exactly 64 characters', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    // Build a valid 64-char kebab-case name: "a" repeated 64 times
    const name64 = 'a'.repeat(64)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: '1', name: name64 }, error: null }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: name64,
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(200)
  })

  it('rejects name with uppercase letters', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'Code-Critic',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('rejects name with digits', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'agent-v2',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('rejects name with spaces', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'code critic',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('rejects name with leading hyphen', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: '-code-critic',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('rejects name with trailing hyphen', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'code-critic-',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('rejects name with consecutive hyphens', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'code--critic',
      files: { 'agent.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('accepts valid kebab-case name', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: '1', name: 'code-critic' },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'code-critic',
      files: { 'agent.md': '# Code Critic' },
    }))
    expect(res.status).toBe(200)
  })

  it('accepts single-word name', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: '1', name: 'reviewer' },
            error: null,
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'reviewer',
      files: { 'agent.md': '# Reviewer' },
    }))
    expect(res.status).toBe(200)
  })

  // AC-28: Files required + validateFiles()
  it('returns 400 when files is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'test-agent' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files object is required')
  })

  it('returns 400 when files is an array', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'test-agent', files: ['bad'] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files object is required')
  })

  it('returns 400 when files is empty', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'test-agent', files: {} }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('At least one file is required')
  })

  it('returns 400 when files contain invalid paths', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'test-agent',
      files: { '../bad': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid file path')
  })

  // AC-29: No slug/keywords/hint fields for agents
  it('does not store slug, keywords, or hint fields', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let insertedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: '1', ...data }, error: null }),
          }),
        }
      }),
    })

    await POST(makeRequest({
      name: 'test-agent',
      files: { 'agent.md': '# Test' },
      slug: 'should-be-ignored',
      primaryKeywords: ['ignored'],
      hint: 'ignored',
    }))

    expect(insertedData).not.toHaveProperty('slug')
    expect(insertedData).not.toHaveProperty('primary_keywords')
    expect(insertedData).not.toHaveProperty('secondary_keywords')
    expect(insertedData).not.toHaveProperty('hint')
    expect(insertedData).not.toHaveProperty('is_command')
    expect(insertedData).not.toHaveProperty('is_general')
  })

  // AC-103: 23514 error handled (DB constraint tighter than API validation)
  it('returns 400 for check constraint violation (23514)', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23514', message: 'check constraint violation' },
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'test-agent',
      files: { 'agent.md': '# Test' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('name format and files size')
  })

  // Duplicate name (23505)
  it('returns 400 for duplicate agent name', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'existing-agent',
      files: { 'agent.md': '# Exists' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('name already exists')
  })

  // Global/teams handling
  it('sets teams to empty array when isGlobal is true', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let insertedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: '1', ...data }, error: null }),
          }),
        }
      }),
    })

    await POST(makeRequest({
      name: 'global-agent',
      files: { 'agent.md': '# Global' },
      isGlobal: true,
      teams: ['team-a'],
    }))

    expect(insertedData.is_global).toBe(true)
    expect(insertedData.teams).toEqual([])
  })

  it('passes teams when isGlobal is false', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    let insertedData: Record<string, unknown> = {}

    mockFrom.mockReturnValue({
      insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: '1', ...data }, error: null }),
          }),
        }
      }),
    })

    await POST(makeRequest({
      name: 'team-agent',
      files: { 'agent.md': '# Team' },
      isGlobal: false,
      teams: ['team-a', 'team-b'],
    }))

    expect(insertedData.is_global).toBe(false)
    expect(insertedData.teams).toEqual(['team-a', 'team-b'])
  })
})
