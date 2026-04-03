import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { fetchHooksData } from '@/lib/data/admin-hooks'

// Maximum script content size: 100KB
const MAX_SCRIPT_SIZE = 100 * 1024

// Valid Claude Code hook events
const VALID_EVENTS = ['UserPromptSubmit', 'Stop', 'PreToolUse', 'PostToolUse', 'Notification', 'SubagentStop']

// GET: List all hooks (authenticated)
export async function GET() {
  try {
    const data = await fetchHooksData()
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return Response.json({ error: message }, { status: 401 })
    }
    if (message === 'Admin access required') {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('Hooks list error:', err)
    return Response.json({ error: 'Failed to fetch hooks' }, { status: 500 })
  }
}

// POST: Create new hook (authenticated)
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
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
