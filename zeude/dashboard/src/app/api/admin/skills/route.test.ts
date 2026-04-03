import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

// Mock dependencies
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/lib/skill-utils', () => ({
  hasAllowedTools: vi.fn((content: string) => content.includes('allowed-tools')),
}))

import { getSession } from '@/lib/session'
import { hasAllowedTools } from '@/lib/skill-utils'

const mockGetSession = vi.mocked(getSession)
const mockHasAllowedTools = vi.mocked(hasAllowedTools)

function adminSession() {
  return { user: { id: 'user-1', role: 'admin', email: 'admin@test.com' } }
}

function memberSession() {
  return { user: { id: 'user-2', role: 'member', email: 'member@test.com' } }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/skills', () => {
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

  it('returns skills and teams on success', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const mockSkills = [{ id: '1', name: 'Skill 1', slug: 'skill-1', created_by: null, contributors: [] }]
    const mockUsersData = [
      { id: 'u1', name: 'Alice', email: 'alice@test.com', team: 'team-a', status: 'active' },
      { id: 'u2', name: 'Bob', email: 'bob@test.com', team: 'team-b', status: 'active' },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'zeude_skills') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockSkills, error: null }),
          }),
        }
      }
      if (table === 'zeude_users') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockUsersData, error: null }),
          }),
        }
      }
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skills).toHaveLength(1)
    expect(json.skills[0].id).toBe('1')
    expect(json.teams).toEqual(['team-a', 'team-b'])
  })
})

describe('POST /api/admin/skills', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ name: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockGetSession.mockResolvedValue(memberSession() as never)
    const res = await POST(makeRequest({ name: 'Test' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ slug: 'test', files: { 'SKILL.md': 'content' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Name is required')
  })

  it('returns 400 when slug is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'Test', files: { 'SKILL.md': 'content' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Slug is required')
  })

  it('returns 400 for invalid slug format', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'Test',
      slug: 'Invalid Slug!',
      files: { 'SKILL.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('kebab-case')
  })

  it('accepts valid kebab-case slug with digits', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const skillData = { id: '1', name: 'Test', slug: 'my-skill-v2' }

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: skillData, error: null }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'Test',
      slug: 'my-skill-v2',
      files: { 'SKILL.md': 'content' },
    }))
    expect(res.status).toBe(200)
  })

  // AC-20: files required with SKILL.md
  it('returns 400 when files is missing', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Files is required')
  })

  it('returns 400 when files is empty object', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'Test', slug: 'test', files: {} }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Files is required')
  })

  it('returns 400 when files is an array', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({ name: 'Test', slug: 'test', files: ['a'] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Files is required')
  })

  it('returns 400 when SKILL.md is missing from files', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'Test',
      slug: 'test',
      files: { 'other.md': 'content' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files must include SKILL.md')
  })

  it('returns 400 when SKILL.md is not a string', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'Test',
      slug: 'test',
      files: { 'SKILL.md': 123 },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Files must include SKILL.md')
  })

  // AC-22: validateFiles() called - invalid path triggers validation error
  it('returns 400 when files contain invalid paths', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)
    const res = await POST(makeRequest({
      name: 'Test',
      slug: 'test',
      files: { 'SKILL.md': 'content', '../etc/passwd': 'bad' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid file path')
  })

  // AC-21: content = NULL for new skills
  it('sets content to NULL for new skills', async () => {
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
      name: 'Test Skill',
      slug: 'test-skill',
      files: { 'SKILL.md': '# Test' },
    }))

    expect(insertedData.content).toBeNull()
  })

  // AC-23: isCommand from hasAllowedTools
  it('sets is_command based on hasAllowedTools result', async () => {
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

    mockHasAllowedTools.mockReturnValue(true)

    await POST(makeRequest({
      name: 'Command Skill',
      slug: 'command-skill',
      files: { 'SKILL.md': '---\nallowed-tools: []\n---\ncontent' },
    }))

    expect(mockHasAllowedTools).toHaveBeenCalledWith('---\nallowed-tools: []\n---\ncontent')
    expect(insertedData.is_command).toBe(true)
  })

  it('sets is_command to false when no allowed-tools', async () => {
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

    mockHasAllowedTools.mockReturnValue(false)

    await POST(makeRequest({
      name: 'General Skill',
      slug: 'general-skill',
      files: { 'SKILL.md': '# Just a normal skill' },
    }))

    expect(insertedData.is_command).toBe(false)
  })

  // AC-98: is_general/is_command fields stored
  it('stores is_general field', async () => {
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
      name: 'General Skill',
      slug: 'general-skill',
      files: { 'SKILL.md': '# General' },
      isGeneral: true,
    }))

    expect(insertedData.is_general).toBe(true)
  })

  // AC-99: keyword/hint fields stored
  it('stores primaryKeywords, secondaryKeywords, and hint', async () => {
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
      name: 'Keyword Skill',
      slug: 'keyword-skill',
      files: { 'SKILL.md': '# Keywords' },
      primaryKeywords: ['deploy', 'release'],
      secondaryKeywords: ['ship', 'publish'],
      hint: 'Use this for deployment tasks',
    }))

    expect(insertedData.primary_keywords).toEqual(['deploy', 'release'])
    expect(insertedData.secondary_keywords).toEqual(['ship', 'publish'])
    expect(insertedData.hint).toBe('Use this for deployment tasks')
  })

  it('defaults keywords to empty arrays and hint to empty string', async () => {
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
      name: 'Minimal Skill',
      slug: 'minimal-skill',
      files: { 'SKILL.md': '# Minimal' },
    }))

    expect(insertedData.primary_keywords).toEqual([])
    expect(insertedData.secondary_keywords).toEqual([])
    expect(insertedData.hint).toBe('')
  })

  // Teams / global handling
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
      name: 'Global Skill',
      slug: 'global-skill',
      files: { 'SKILL.md': '# Global' },
      isGlobal: true,
      teams: ['team-a', 'team-b'],
    }))

    expect(insertedData.is_global).toBe(true)
    expect(insertedData.teams).toEqual([])
  })

  // Duplicate slug error (23505)
  it('returns 400 for duplicate slug', async () => {
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
      name: 'Dupe',
      slug: 'existing-slug',
      files: { 'SKILL.md': '# Dupe' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('slug already exists')
  })

  // Check constraint violation (23514)
  it('returns 400 for check constraint violation', async () => {
    mockGetSession.mockResolvedValue(adminSession() as never)

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23514', message: 'check constraint' },
          }),
        }),
      }),
    })

    const res = await POST(makeRequest({
      name: 'Bad',
      slug: 'bad-skill',
      files: { 'SKILL.md': '# Bad' },
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('files size')
  })
})
