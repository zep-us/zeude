import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// GET: List all MCP servers
export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const supabase = createServerClient()

    const { data: servers, error } = await supabase
      .from('zeude_mcp_servers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch MCP servers:', error)
      return Response.json({ error: 'Failed to fetch servers' }, { status: 500 })
    }

    // Get unique teams and users for filter dropdown
    const { data: usersData } = await supabase
      .from('zeude_users')
      .select('id, name, email, team')
      .order('team')

    const teams = [...new Set(usersData?.map(u => u.team) || [])]
    const users = usersData || []

    // Get install status for all servers
    const { data: installStatus } = await supabase
      .from('zeude_mcp_install_status')
      .select('user_id, mcp_server_id, installed, version, last_checked_at')

    // Group install status by server
    const installStatusByServer: Record<string, {
      installed: number
      total: number
      details: Array<{
        userId: string
        userName: string
        installed: boolean
        version: string | null
        lastCheckedAt: string | null
      }>
    }> = {}

    for (const server of servers || []) {
      const serverStatus = (installStatus || []).filter(s => s.mcp_server_id === server.id)
      const userMap = new Map(users.map(u => [u.id, u]))

      // Get applicable users (global or team-matched)
      const applicableUsers = users.filter(u => {
        if (server.is_global) return true
        return server.teams.includes(u.team)
      })

      installStatusByServer[server.id] = {
        installed: serverStatus.filter(s => s.installed).length,
        total: applicableUsers.length,
        details: applicableUsers.map(u => {
          const status = serverStatus.find(s => s.user_id === u.id)
          return {
            userId: u.id,
            userName: u.name || u.email,
            installed: status?.installed || false,
            version: status?.version || null,
            lastCheckedAt: status?.last_checked_at || null,
          }
        }),
      }
    }

    return Response.json({ servers, teams, installStatus: installStatusByServer })
  } catch (err) {
    console.error('MCP list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new MCP server
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { name, command, args = [], env = {}, teams = [], isGlobal = false } = body

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!command || typeof command !== 'string') {
      return Response.json({ error: 'Command is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: server, error } = await supabase
      .from('zeude_mcp_servers')
      .insert({
        name,
        command,
        args,
        env,
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
