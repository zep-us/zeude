import { createServerClient, isDBConnectionError } from '@/lib/supabase'
import { rateLimit, getClientIP } from '@/lib/rate-limit'
import { createHash } from 'crypto'

// Stable hash function for deterministic hashing
// Uses sorted keys to ensure consistent output regardless of object property order
function stableHash(obj: unknown): string {
  const sortedJson = JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = value[key]
        return sorted
      }, {})
    }
    return value
  })
  return createHash('sha256').update(sortedJson).digest('hex').slice(0, 32)
}

// Agent key format: zd_ followed by 64 hex characters
const AGENT_KEY_PATTERN = /^zd_[a-f0-9]{64}$/

// Extract agent key from Authorization header (preferred) or URL path (deprecated)
function extractAgentKey(req: Request, urlAgentKey: string): string | null {
  // Prefer Authorization header: "Bearer zd_xxx"
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  // Fall back to URL path (deprecated, will be logged)
  return urlAgentKey || null
}

// GET: Fetch MCP config for CLI
export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentKey: string }> }
) {
  try {
    const { agentKey: urlAgentKey } = await params
    const agentKey = extractAgentKey(req, urlAgentKey)

    if (!agentKey) {
      return Response.json({ error: 'Agent key required' }, { status: 401 })
    }

    // Rate limiting: 10 requests per minute per agent key
    const rateLimitResult = rateLimit(`config:${agentKey}`, { limit: 10, windowMs: 60 * 1000 })

    if (!rateLimitResult.success) {
      return Response.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }

    // Validate agent key format
    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key format' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Find user by agent key
    const { data: user, error: userError } = await supabase
      .from('zeude_users')
      .select('id, email, team, status, disabled_skills')
      .eq('agent_key', agentKey)
      .single()

    if (isDBConnectionError(userError)) {
      console.error('DB connection failed during config fetch:', { error: userError, agentKey })
      return Response.json({ error: 'Database connection failed. This is a server infrastructure issue.', code: 'DB_CONNECTION_ERROR' }, { status: 503 })
    }

    if (userError || !user) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    if (user.status !== 'active') {
      return Response.json({ error: 'User account is inactive' }, { status: 403 })
    }

    // Fetch MCP servers, skills, hooks, and agents in parallel for better performance
    // DB-level filtering by team (is_global OR team membership) for efficiency
    const [serversResult, skillsResult, hooksResult, agentsResult] = await Promise.all([
      supabase
        .from('zeude_mcp_servers')
        .select('id, name, url, command, args, env, is_global, teams')
        .eq('status', 'active')
        .or(`is_global.eq.true,teams.cs.{"${user.team}"}`),
      supabase
        .from('zeude_skills')
        .select('id, name, slug, description, content, files, is_global, teams')
        .eq('status', 'active')
        .or(`is_global.eq.true,teams.cs.{"${user.team}"}`),
      supabase
        .from('zeude_hooks')
        .select('id, name, event, description, script_content, script_type, env, is_global, teams')
        .eq('status', 'active')
        .or(`is_global.eq.true,teams.cs.{"${user.team}"}`),
      supabase
        .from('zeude_agents')
        .select('id, name, description, files, is_global, teams')
        .eq('status', 'active')
        .or(`is_global.eq.true,teams.cs.{"${user.team}"}`),
    ])

    const { data: servers, error: serversError } = serversResult
    const { data: skills, error: skillsError } = skillsResult
    const { data: hooks, error: hooksError } = hooksResult
    const { data: agents, error: agentsError } = agentsResult

    // Sort arrays by ID for deterministic hash generation
    // Without sorting, DB may return rows in different order causing hash mismatch
    servers?.sort((a, b) => a.id.localeCompare(b.id))
    skills?.sort((a, b) => a.id.localeCompare(b.id))
    hooks?.sort((a, b) => a.id.localeCompare(b.id))
    agents?.sort((a, b) => a.id.localeCompare(b.id))

    if (serversError) {
      console.error('Failed to fetch MCP servers:', serversError)
      return Response.json({ error: 'Failed to fetch config' }, { status: 500 })
    }

    if (skillsError) {
      console.error('Failed to fetch skills:', skillsError)
      // Non-fatal: continue without skills
    }

    if (hooksError) {
      console.error('Failed to fetch hooks:', hooksError)
      // Non-fatal: continue without hooks
    }

    if (agentsError) {
      console.error('Failed to fetch agents:', agentsError)
      // Non-fatal: continue without agents
    }

    // Servers already filtered at DB level
    const applicableServers = servers || []

    // Format as claude.json mcpServers format
    const mcpServers: Record<string, { type?: string; url?: string; command?: string; args?: string[]; env?: Record<string, string> }> = {}
    const usedKeys = new Set<string>()

    for (const server of applicableServers) {
      // Use a sanitized name as the key (lowercase, replace spaces with dashes)
      let baseKey = server.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      // Handle name collisions by appending short UUID suffix
      let serverKey = baseKey
      if (usedKeys.has(serverKey)) {
        // Use first 8 chars of UUID to make unique
        const shortId = server.id.split('-')[0]
        serverKey = `${baseKey}-${shortId}`
      }
      usedKeys.add(serverKey)

      // URL-based server: include type and url fields (type is required by Claude Code)
      if (server.url) {
        mcpServers[serverKey] = { type: 'http', url: server.url }
      } else {
        mcpServers[serverKey] = {
          command: server.command,
          args: server.args || [],
        }

        // Only include env if it has values
        if (server.env && Object.keys(server.env).length > 0) {
          mcpServers[serverKey].env = server.env
        }
      }
    }

    // Skills already filtered at DB level; additionally filter out user's disabled skills
    const userDisabledSkills: string[] = user.disabled_skills ?? []
    const applicableSkills = skillsError ? null : (skills || []).filter(
      s => !userDisabledSkills.includes(s.slug)
    )

    // Format skills for CLI (include files for multi-file support, keep content for backward compat)
    const skillsList = applicableSkills ? applicableSkills.map(skill => ({
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      content: skill.content,
      files: skill.files || null,
    })) : null

    // Hooks already filtered at DB level
    const applicableHooks = hooksError ? null : (hooks || [])

    // Format hooks for CLI
    const hooksList = applicableHooks ? applicableHooks.map(hook => ({
      id: hook.id,
      name: hook.name,
      event: hook.event,
      description: hook.description,
      script: hook.script_content,
      scriptType: hook.script_type,
      env: hook.env || {},
    })) : null

    // Agents already filtered at DB level
    const applicableAgents = agentsError ? null : (agents || [])

    // Format agents for CLI
    const agentsList = applicableAgents ? applicableAgents.map(agent => ({
      name: agent.name,
      description: agent.description,
      files: agent.files,
    })) : null

    // Compute category-level hashes for efficient sync (Merkle-tree style)
    const mcpServersHash = stableHash(mcpServers)
    const skillsHash = stableHash(skillsList)
    const hooksHash = stableHash(hooksList)
    const agentsHash = stableHash(agentsList)
    const rootHash = stableHash({ mcpServers: mcpServersHash, skills: skillsHash, hooks: hooksHash, agents: agentsHash })

    // Check If-None-Match header for conditional request (ETag support)
    const clientETag = req.headers.get('If-None-Match')
    if (clientETag === rootHash) {
      // Config unchanged - return 304 Not Modified (no body, saves bandwidth)
      return new Response(null, {
        status: 304,
        headers: { 'ETag': rootHash },
      })
    }

    return Response.json({
      mcpServers,
      skills: skillsList,
      hooks: hooksList,
      agents: agentsList,
      // Merkle-tree style hashes for efficient sync
      hashes: {
        root: rootHash,
        mcpServers: mcpServersHash,
        skills: skillsHash,
        hooks: hooksHash,
        agents: agentsHash,
      },
      configVersion: rootHash,  // Root hash as version (replaces timestamp)
      serverCount: applicableServers.length,
      skillCount: skillsList?.length ?? null,
      hookCount: hooksList?.length ?? null,
      agentCount: agentsList?.length ?? null,
      // User info for hook env var injection and OTEL telemetry
      userId: user.id,  // Supabase UUID - used to match ClickHouse data with Supabase
      userEmail: user.email,
      team: user.team || 'default',
    }, {
      headers: { 'ETag': rootHash },
    })
  } catch (err) {
    console.error('Config fetch error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
