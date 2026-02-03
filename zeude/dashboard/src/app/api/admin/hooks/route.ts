import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Maximum script content size: 100KB
const MAX_SCRIPT_SIZE = 100 * 1024

// Valid Claude Code hook events
const VALID_EVENTS = ['UserPromptSubmit', 'Stop', 'PreToolUse', 'PostToolUse', 'Notification', 'SubagentStop']

// GET: List all hooks
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

    const { data: hooks, error } = await supabase
      .from('zeude_hooks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch hooks:', error)
      return Response.json({ error: 'Failed to fetch hooks' }, { status: 500 })
    }

    // Get unique teams and users for filter dropdown
    const { data: usersData } = await supabase
      .from('zeude_users')
      .select('id, name, email, team')
      .order('team')

    const teams = [...new Set(usersData?.map(u => u.team) || [])]
    const users = usersData || []

    // Get install status for all hooks
    const { data: installStatus } = await supabase
      .from('zeude_hook_install_status')
      .select('user_id, hook_id, installed, version, last_checked_at')

    // Pre-compute maps for O(1) lookups (instead of O(N*M) nested loops)
    const userMap = new Map(users.map(u => [u.id, u]))
    const installStatusArray = installStatus || []
    const statusByHookId = installStatusArray.reduce((acc, s) => {
      if (!acc[s.hook_id]) acc[s.hook_id] = []
      acc[s.hook_id].push(s)
      return acc
    }, {} as Record<string, typeof installStatusArray>)

    // Group install status by hook
    const installStatusByHook: Record<string, {
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

    for (const hook of hooks || []) {
      const hookStatus = statusByHookId[hook.id] || []

      // Get applicable users (global or team-matched)
      const applicableUsers = users.filter(u => {
        if (hook.is_global) return true
        return hook.teams.includes(u.team)
      })

      installStatusByHook[hook.id] = {
        installed: hookStatus.filter(s => s.installed).length,
        total: applicableUsers.length,
        details: applicableUsers.map(u => {
          const status = hookStatus.find(s => s.user_id === u.id)
          return {
            userId: u.id,
            userName: userMap.get(u.id)?.name || u.email,
            installed: status?.installed || false,
            version: status?.version || null,
            lastCheckedAt: status?.last_checked_at || null,
          }
        }),
      }
    }

    return Response.json({ hooks, teams, installStatus: installStatusByHook })
  } catch (err) {
    console.error('Hooks list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new hook
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
    const { name, event, description, scriptContent, scriptType = 'bash', env = {}, teams = [], isGlobal = false } = body

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!event || typeof event !== 'string') {
      return Response.json({ error: 'Event is required' }, { status: 400 })
    }

    if (!VALID_EVENTS.includes(event)) {
      return Response.json({ error: `Invalid event. Valid events: ${VALID_EVENTS.join(', ')}` }, { status: 400 })
    }

    if (!scriptContent || typeof scriptContent !== 'string') {
      return Response.json({ error: 'Script content is required' }, { status: 400 })
    }

    if (scriptContent.length > MAX_SCRIPT_SIZE) {
      return Response.json({
        error: `Script too large. Maximum size is ${MAX_SCRIPT_SIZE / 1024}KB`
      }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: hook, error } = await supabase
      .from('zeude_hooks')
      .insert({
        name,
        event,
        description: description || null,
        script_content: scriptContent,
        script_type: scriptType,
        env,
        teams: isGlobal ? [] : teams,
        is_global: isGlobal,
        status: 'active',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create hook:', error)
      return Response.json({ error: 'Failed to create hook' }, { status: 500 })
    }

    return Response.json({ hook })
  } catch (err) {
    console.error('Hook create error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
