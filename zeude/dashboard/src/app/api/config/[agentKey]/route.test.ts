import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

const mockDb = {
  users: {
    findByAgentKey: vi.fn(),
  },
  mcp: {
    listActiveForTeam: vi.fn(),
  },
  skills: {
    listActiveForTeam: vi.fn(),
  },
  hooks: {
    listActiveForTeam: vi.fn(),
  },
  agents: {
    listActiveForTeam: vi.fn(),
  },
}

vi.mock('@/lib/db', () => ({
  getOperationalDb: vi.fn(() => mockDb),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, resetAt: 0 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
}))

import { rateLimit } from '@/lib/rate-limit'

const mockRateLimit = vi.mocked(rateLimit)

const VALID_AGENT_KEY = 'zd_' + 'a'.repeat(64)

function makeParams(agentKey: string) {
  return { params: Promise.resolve({ agentKey }) }
}

function makeRequest(headers?: Record<string, string>): Request {
  return new Request(`http://localhost/api/config/${VALID_AGENT_KEY}`, {
    headers: headers || {},
  })
}

function makeRequestWithAuth(agentKey: string): Request {
  return new Request('http://localhost/api/config/placeholder', {
    headers: { 'Authorization': `Bearer ${agentKey}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimit.mockReturnValue({ success: true, remaining: 5, resetAt: 0 })
  mockDb.users.findByAgentKey.mockReturnValue({
    id: 'u-1',
    email: 'test@test.com',
    team: 'team-a',
    status: 'active',
    disabled_skills: [],
  })
  mockDb.mcp.listActiveForTeam.mockReturnValue([])
  mockDb.skills.listActiveForTeam.mockReturnValue([])
  mockDb.hooks.listActiveForTeam.mockReturnValue([])
  mockDb.agents.listActiveForTeam.mockReturnValue([])
})

describe('GET /api/config/[agentKey]', () => {
  it('returns 401 when no agent key provided', async () => {
    const req = new Request('http://localhost/api/config/', {})
    const res = await GET(req, { params: Promise.resolve({ agentKey: '' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid agent key format', async () => {
    const res = await GET(makeRequest(), makeParams('invalid-key'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid agent key format')
  })

  it('extracts agent key from Authorization Bearer header', async () => {
    const req = makeRequestWithAuth(VALID_AGENT_KEY)
    const res = await GET(req, makeParams('url-key-ignored'))
    expect(res.status).toBe(200)
    expect(mockDb.users.findByAgentKey).toHaveBeenCalledWith(VALID_AGENT_KEY)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ success: false, remaining: 0, resetAt: Date.now() + 30000 })
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(429)
  })

  it('returns 401 for unknown agent key', async () => {
    mockDb.users.findByAgentKey.mockReturnValue(null)
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Invalid agent key')
  })

  it('returns 403 for inactive user', async () => {
    mockDb.users.findByAgentKey.mockReturnValue({
      id: 'u-1',
      email: 'test@test.com',
      team: 'team-a',
      status: 'inactive',
      disabled_skills: [],
    })
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(403)
  })

  it('includes agents array in response', async () => {
    mockDb.agents.listActiveForTeam.mockReturnValue([
      { id: 'a-1', name: 'code-critic', description: 'Reviews code', files: { 'agent.md': '# Agent' }, is_global: true, teams: [] },
    ])

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toEqual([
      { name: 'code-critic', description: 'Reviews code', files: { 'agent.md': '# Agent' } },
    ])
  })

  it('filters out disabled skills', async () => {
    mockDb.users.findByAgentKey.mockReturnValue({
      id: 'u-1',
      email: 'test@test.com',
      team: 'team-a',
      status: 'active',
      disabled_skills: ['hidden-skill'],
    })
    mockDb.skills.listActiveForTeam.mockReturnValue([
      { id: 's-1', name: 'Visible', slug: 'visible-skill', description: null, content: null, files: {}, is_global: true, teams: [] },
      { id: 's-2', name: 'Hidden', slug: 'hidden-skill', description: null, content: null, files: {}, is_global: true, teams: [] },
    ])

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skills).toHaveLength(1)
    expect(json.skills[0].slug).toBe('visible-skill')
  })

  it('returns 304 when If-None-Match matches the current root hash', async () => {
    const first = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const firstJson = await first.json()

    const second = await GET(
      makeRequest({ 'If-None-Match': firstJson.hashes.root }),
      makeParams(VALID_AGENT_KEY)
    )

    expect(second.status).toBe(304)
  })
})
