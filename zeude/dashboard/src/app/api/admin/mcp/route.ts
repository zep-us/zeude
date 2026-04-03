import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { fetchMCPData } from '@/lib/data/admin-mcp'

// GET: List all MCP servers (authenticated)
export async function GET() {
  try {
    const data = await fetchMCPData()
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return Response.json({ error: message }, { status: 401 })
    }
    if (message === 'Admin access required') {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('MCP list error:', err)
    return Response.json({ error: 'Failed to fetch servers' }, { status: 500 })
  }
}

// POST: Create new MCP server (authenticated)
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { name, url, command, args = [], env = {}, teams = [], isGlobal = false } = body

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    const hasUrl = url && typeof url === 'string' && url.trim() !== ''
    const hasCommand = command && typeof command === 'string' && command.trim() !== ''

    if (!hasUrl && !hasCommand) {
      return Response.json({ error: 'Either URL or Command is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: server, error } = await supabase
      .from('zeude_mcp_servers')
      .insert({
        name,
        url: hasUrl ? url.trim() : null,
        command: hasCommand ? command.trim() : '',
        args: hasUrl ? [] : args,
        env: hasUrl ? {} : env,
        teams: isGlobal ? [] : teams,
        is_global: isGlobal,
        status: 'active',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create MCP server:', error)
      return Response.json({ error: 'Failed to create server' }, { status: 500 })
    }

    return Response.json({ server })
  } catch (err) {
    console.error('MCP create error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
