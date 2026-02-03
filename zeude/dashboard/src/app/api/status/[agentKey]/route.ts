import { createServerClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'

// Agent key format: zd_ followed by 64 hex characters
const AGENT_KEY_PATTERN = /^zd_[a-f0-9]{64}$/

interface McpInstallStatusItem {
  serverName: string
  installed: boolean
  version?: string
}

interface HookInstallStatusItem {
  hookId: string
  installed: boolean
  version?: string
}

interface InstallStatusPayload {
  installStatus?: McpInstallStatusItem[]
  hookInstallStatus?: HookInstallStatusItem[]
}

// POST: Receive installation status from CLI
export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentKey: string }> }
) {
  try {
    const { agentKey: urlAgentKey } = await params

    // Extract agent key from Authorization header (preferred)
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : urlAgentKey

    if (!agentKey) {
      return Response.json({ error: 'Agent key required' }, { status: 401 })
    }

    // Rate limiting: 5 requests per minute per agent key
    const rateLimitResult = rateLimit(`status:${agentKey}`, { limit: 5, windowMs: 60 * 1000 })

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
    if (!AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key format' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Find user by agent key
    const { data: user, error: userError } = await supabase
      .from('zeude_users')
      .select('id, team, status')
      .eq('agent_key', agentKey)
      .single()

    if (userError || !user) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    if (user.status !== 'active') {
      return Response.json({ error: 'User account is inactive' }, { status: 403 })
    }

    // Parse request body
    const body: InstallStatusPayload = await req.json()

    if (!body.installStatus && !body.hookInstallStatus) {
      return Response.json({ error: 'Invalid payload: requires installStatus or hookInstallStatus' }, { status: 400 })
    }

    // Get MCP servers to map server names to IDs
    const { data: mcpServers, error: serversError } = await supabase
      .from('zeude_mcp_servers')
      .select('id, name')
      .eq('status', 'active')

    if (serversError) {
      console.error('Failed to fetch MCP servers:', serversError)
      return Response.json({ error: 'Failed to fetch servers' }, { status: 500 })
    }

    // Create a map of server name (kebab-cased) to server ID
    const serverNameToId: Record<string, string> = {}
    for (const server of mcpServers || []) {
      const kebabName = server.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      serverNameToId[kebabName] = server.id
      // Also map the exact name
      serverNameToId[server.name] = server.id
    }

    // Upsert MCP install status records
    const now = new Date().toISOString()
    const mcpUpsertData = []

    if (body.installStatus && Array.isArray(body.installStatus)) {
      for (const item of body.installStatus) {
        const serverId = serverNameToId[item.serverName]
        if (!serverId) {
          // Server name not found, skip
          continue
        }

        mcpUpsertData.push({
          user_id: user.id,
          mcp_server_id: serverId,
          installed: item.installed,
          version: item.version || null,
          last_checked_at: now,
        })
      }

      if (mcpUpsertData.length > 0) {
        const { error: upsertError } = await supabase
          .from('zeude_mcp_install_status')
          .upsert(mcpUpsertData, {
            onConflict: 'user_id,mcp_server_id',
          })

        if (upsertError) {
          console.error('Failed to upsert MCP install status:', upsertError)
          return Response.json({ error: 'Failed to save MCP status' }, { status: 500 })
        }
      }
    }

    // Upsert Hook install status records
    const hookUpsertData = []

    if (body.hookInstallStatus && Array.isArray(body.hookInstallStatus)) {
      for (const item of body.hookInstallStatus) {
        if (!item.hookId) continue

        hookUpsertData.push({
          user_id: user.id,
          hook_id: item.hookId,
          installed: item.installed,
          version: item.version || null,
          last_checked_at: now,
        })
      }

      if (hookUpsertData.length > 0) {
        const { error: upsertError } = await supabase
          .from('zeude_hook_install_status')
          .upsert(hookUpsertData, {
            onConflict: 'user_id,hook_id',
          })

        if (upsertError) {
          console.error('Failed to upsert hook install status:', upsertError)
          return Response.json({ error: 'Failed to save hook status' }, { status: 500 })
        }
      }
    }

    return Response.json({
      success: true,
      mcpUpdated: mcpUpsertData.length,
      hooksUpdated: hookUpsertData.length,
    })
  } catch (err) {
    console.error('Status update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
