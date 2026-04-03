import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

// Mock dependencies
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
  isDBConnectionError: vi.fn((error: unknown) => {
    if (!error || typeof error !== 'object') return false
    const e = error as { message?: string; details?: string }
    const msg = `${e.message || ''} ${e.details || ''}`
    return msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')
  }),
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

// Helper to build a chainable supabase mock for a specific table
function mockSupabaseTable(table: string, result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
        or: vi.fn().mockResolvedValue(result),
      }),
      order: vi.fn().mockResolvedValue(result),
      or: vi.fn().mockResolvedValue(result),
    }),
  }
}

function setupUserAndDataMocks(options: {
  user?: { id: string; email: string; team: string; status: string } | null;
  userError?: unknown;
  servers?: unknown[];
  skills?: unknown[];
  hooks?: unknown[];
  agents?: unknown[];
  serversError?: unknown;
  skillsError?: unknown;
  hooksError?: unknown;
  agentsError?: unknown;
}) {
  const {
    user = { id: 'u-1', email: 'test@test.com', team: 'team-a', status: 'active' },
    userError = null,
    servers = [],
    skills = [],
    hooks = [],
    agents = [],
    serversError = null,
    skillsError = null,
    hooksError = null,
    agentsError = null,
  } = options

  mockFrom.mockImplementation((table: string) => {
    if (table === 'zeude_users') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: user, error: userError }),
          }),
        }),
      }
    }
    if (table === 'zeude_mcp_servers') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: servers, error: serversError }),
          }),
        }),
      }
    }
    if (table === 'zeude_skills') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: skills, error: skillsError }),
          }),
        }),
      }
    }
    if (table === 'zeude_hooks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: hooks, error: hooksError }),
          }),
        }),
      }
    }
    if (table === 'zeude_agents') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: agents, error: agentsError }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimit.mockReturnValue({ success: true, remaining: 5, resetAt: 0 })
})

describe('GET /api/config/[agentKey]', () => {
  // Auth validation
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

  it('returns 400 for agent key with wrong prefix', async () => {
    const res = await GET(makeRequest(), makeParams('xx_' + 'a'.repeat(64)))
    expect(res.status).toBe(400)
  })

  it('returns 400 for agent key with wrong length', async () => {
    const res = await GET(makeRequest(), makeParams('zd_' + 'a'.repeat(32)))
    expect(res.status).toBe(400)
  })

  it('extracts agent key from Authorization Bearer header', async () => {
    setupUserAndDataMocks({})
    const req = makeRequestWithAuth(VALID_AGENT_KEY)
    const res = await GET(req, makeParams('url-key-ignored'))
    expect(res.status).toBe(200)
  })

  it('falls back to URL agent key when no auth header', async () => {
    setupUserAndDataMocks({})
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
  })

  // Rate limiting
  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ success: false, remaining: 0, resetAt: Date.now() + 30000 })
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toBe('Too many requests')
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })

  // User lookup
  it('returns 401 for unknown agent key', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    }))

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Invalid agent key')
  })

  it('returns 403 for inactive user', async () => {
    setupUserAndDataMocks({
      user: { id: 'u-1', email: 'test@test.com', team: 'team-a', status: 'inactive' },
    })
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('User account is inactive')
  })

  // DB connection error
  it('returns 503 on DB connection error', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'fetch failed', code: 'NETWORK' },
          }),
        }),
      }),
    }))

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.code).toBe('DB_CONNECTION_ERROR')
  })

  // AC-33: agents[] in response
  it('includes agents array in response', async () => {
    const testAgents = [
      { id: 'a-1', name: 'code-critic', description: 'Reviews code', files: { 'agent.md': '# Agent' }, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ agents: testAgents })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toBeDefined()
    expect(json.agents).toHaveLength(1)
  })

  // AC-37: Agents response format {name, description, files}
  it('formats agents as {name, description, files}', async () => {
    const testAgents = [
      { id: 'a-1', name: 'code-critic', description: 'Reviews code', files: { 'agent.md': '# Agent' }, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ agents: testAgents })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.agents[0]).toEqual({
      name: 'code-critic',
      description: 'Reviews code',
      files: { 'agent.md': '# Agent' },
    })
    // Should NOT include id, is_global, teams in the formatted output
    expect(json.agents[0]).not.toHaveProperty('id')
    expect(json.agents[0]).not.toHaveProperty('is_global')
    expect(json.agents[0]).not.toHaveProperty('teams')
  })

  // AC-36/AC-96: Both content and files in skills response
  it('includes both content and files in skills response', async () => {
    const testSkills = [
      {
        id: 's-1', name: 'deploy', slug: 'deploy', description: 'Deploy',
        content: '# Legacy content', files: { 'SKILL.md': '# New content' },
        is_global: true, teams: [],
      },
    ]
    setupUserAndDataMocks({ skills: testSkills })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.skills[0].content).toBe('# Legacy content')
    expect(json.skills[0].files).toEqual({ 'SKILL.md': '# New content' })
  })

  it('sets files to null when skill has no files', async () => {
    const testSkills = [
      {
        id: 's-1', name: 'old-skill', slug: 'old-skill', description: 'Old',
        content: '# Content only', files: null,
        is_global: true, teams: [],
      },
    ]
    setupUserAndDataMocks({ skills: testSkills })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.skills[0].files).toBeNull()
    expect(json.skills[0].content).toBe('# Content only')
  })

  // AC-34/AC-100: Merkle hash includes agents, deterministic sorting
  it('includes agents hash in Merkle hash structure', async () => {
    setupUserAndDataMocks({
      agents: [
        { id: 'a-1', name: 'agent-a', description: 'A', files: {}, is_global: true, teams: [] },
      ],
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.hashes).toBeDefined()
    expect(json.hashes.agents).toBeDefined()
    expect(json.hashes.root).toBeDefined()
    expect(json.hashes.mcpServers).toBeDefined()
    expect(json.hashes.skills).toBeDefined()
    expect(json.hashes.hooks).toBeDefined()
  })

  it('produces deterministic hash regardless of data order', async () => {
    const agents = [
      { id: 'a-2', name: 'beta', description: 'B', files: {}, is_global: true, teams: [] },
      { id: 'a-1', name: 'alpha', description: 'A', files: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ agents })

    const res1 = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json1 = await res1.json()

    // Reverse order
    const agentsReversed = [
      { id: 'a-1', name: 'alpha', description: 'A', files: {}, is_global: true, teams: [] },
      { id: 'a-2', name: 'beta', description: 'B', files: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ agents: agentsReversed })

    const res2 = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json2 = await res2.json()

    // Both should produce same root hash since they sort by ID
    expect(json1.hashes.root).toBe(json2.hashes.root)
    expect(json1.hashes.agents).toBe(json2.hashes.agents)
  })

  // AC-101: ETag/304 support
  it('returns 304 when If-None-Match matches current hash', async () => {
    setupUserAndDataMocks({})

    // First request to get the ETag
    const res1 = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json1 = await res1.json()
    const etag = json1.hashes.root

    // Second request with matching If-None-Match
    setupUserAndDataMocks({})
    const req2 = new Request(`http://localhost/api/config/${VALID_AGENT_KEY}`, {
      headers: { 'If-None-Match': etag },
    })
    const res2 = await GET(req2, makeParams(VALID_AGENT_KEY))
    expect(res2.status).toBe(304)
  })

  // AC-107: ETag header in 200
  it('includes ETag header in 200 response', async () => {
    setupUserAndDataMocks({})
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBeTruthy()
  })

  it('ETag header matches configVersion/root hash', async () => {
    setupUserAndDataMocks({})
    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(res.headers.get('ETag')).toBe(json.hashes.root)
    expect(json.configVersion).toBe(json.hashes.root)
  })

  // AC-102: Agents error non-fatal
  it('continues without agents when agents query fails', async () => {
    setupUserAndDataMocks({
      agentsError: { message: 'agents table error' },
      agents: null as unknown as unknown[],
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toBeNull()
    expect(json.agentCount).toBeNull()
    // Other data should still be present
    expect(json.mcpServers).toBeDefined()
  })

  it('continues without skills when skills query fails', async () => {
    setupUserAndDataMocks({
      skillsError: { message: 'skills table error' },
      skills: null as unknown as unknown[],
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skills).toBeNull()
    expect(json.skillCount).toBeNull()
  })

  it('returns 500 when servers query fails (fatal)', async () => {
    setupUserAndDataMocks({
      serversError: { message: 'servers table error' },
      servers: null as unknown as unknown[],
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch config')
  })

  // agentCount in response
  it('includes agentCount in response', async () => {
    const testAgents = [
      { id: 'a-1', name: 'agent-one', description: 'One', files: {}, is_global: true, teams: [] },
      { id: 'a-2', name: 'agent-two', description: 'Two', files: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ agents: testAgents })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.agentCount).toBe(2)
  })

  // User info in response
  it('includes user info in response', async () => {
    setupUserAndDataMocks({
      user: { id: 'u-1', email: 'test@test.com', team: 'team-a', status: 'active' },
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.userId).toBe('u-1')
    expect(json.userEmail).toBe('test@test.com')
    expect(json.team).toBe('team-a')
  })

  it('defaults team to "default" when user has no team', async () => {
    setupUserAndDataMocks({
      user: { id: 'u-1', email: 'test@test.com', team: '', status: 'active' },
    })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.team).toBe('default')
  })

  // MCP servers formatting
  it('formats MCP servers correctly', async () => {
    const servers = [
      { id: 's-1', name: 'My Server', command: 'npx', args: ['-y', 'server'], env: { API_KEY: 'xxx' }, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.mcpServers['my-server']).toEqual({
      command: 'npx',
      args: ['-y', 'server'],
      env: { API_KEY: 'xxx' },
    })
  })

  it('omits env when empty', async () => {
    const servers = [
      { id: 's-1', name: 'Simple', command: 'node', args: [], env: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.mcpServers['simple']).toEqual({
      command: 'node',
      args: [],
    })
    expect(json.mcpServers['simple']).not.toHaveProperty('env')
  })

  // URL-based MCP servers
  it('formats URL-based server with type:http', async () => {
    const servers = [
      { id: 's-1', name: 'Channeltalk', url: 'https://mcp.example.com/channeltalk', command: '', args: [], env: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.mcpServers['channeltalk']).toEqual({
      type: 'http',
      url: 'https://mcp.example.com/channeltalk',
    })
  })

  it('URL-based server does not include command/args/env fields', async () => {
    const servers = [
      { id: 's-1', name: 'PostHog', url: 'https://mcp.example.com/posthog', command: '', args: [], env: { UNUSED: 'val' }, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()
    expect(json.mcpServers['posthog']).toEqual({
      type: 'http',
      url: 'https://mcp.example.com/posthog',
    })
    expect(json.mcpServers['posthog']).not.toHaveProperty('command')
    expect(json.mcpServers['posthog']).not.toHaveProperty('args')
    expect(json.mcpServers['posthog']).not.toHaveProperty('env')
  })

  it('mixes command-based and URL-based servers correctly', async () => {
    const servers = [
      { id: 's-1', name: 'Slack Agent', command: 'npx', args: ['-y', 'slack-mcp'], env: { TOKEN: 'abc' }, is_global: true, teams: [] },
      { id: 's-2', name: 'Channeltalk', url: 'https://mcp.example.com/ct', command: '', args: [], env: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers })

    const res = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json = await res.json()

    // command-based: no type field
    expect(json.mcpServers['slack-agent']).toEqual({
      command: 'npx',
      args: ['-y', 'slack-mcp'],
      env: { TOKEN: 'abc' },
    })
    expect(json.mcpServers['slack-agent']).not.toHaveProperty('type')

    // URL-based: type:http
    expect(json.mcpServers['channeltalk']).toEqual({
      type: 'http',
      url: 'https://mcp.example.com/ct',
    })
  })

  it('URL-based server changes mcpServers hash', async () => {
    // Without URL server
    const servers1 = [
      { id: 's-1', name: 'Basic', command: 'node', args: [], env: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers: servers1 })
    const res1 = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json1 = await res1.json()

    // With additional URL server
    const servers2 = [
      { id: 's-1', name: 'Basic', command: 'node', args: [], env: {}, is_global: true, teams: [] },
      { id: 's-2', name: 'Remote', url: 'https://mcp.example.com/remote', command: '', args: [], env: {}, is_global: true, teams: [] },
    ]
    setupUserAndDataMocks({ servers: servers2 })
    const res2 = await GET(makeRequest(), makeParams(VALID_AGENT_KEY))
    const json2 = await res2.json()

    expect(json1.hashes.mcpServers).not.toBe(json2.hashes.mcpServers)
    expect(json1.hashes.root).not.toBe(json2.hashes.root)
  })
})
