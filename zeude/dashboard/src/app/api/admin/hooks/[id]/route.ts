import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Maximum script content size: 100KB
const MAX_SCRIPT_SIZE = 100 * 1024

// Valid Claude Code hook events
const VALID_EVENTS = ['UserPromptSubmit', 'Stop', 'PreToolUse', 'PostToolUse', 'Notification', 'SubagentStop']

// PATCH: Update hook
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { name, event, description, scriptContent, scriptType, env, teams, isGlobal, status } = body

    // Validate event if provided
    if (event && !VALID_EVENTS.includes(event)) {
      return Response.json({ error: `Invalid event. Valid events: ${VALID_EVENTS.join(', ')}` }, { status: 400 })
    }

    // Validate script size if provided
    if (scriptContent && typeof scriptContent === 'string' && scriptContent.length > MAX_SCRIPT_SIZE) {
      return Response.json({
        error: `Script too large. Maximum size is ${MAX_SCRIPT_SIZE / 1024}KB`
      }, { status: 400 })
    }

    const supabase = createServerClient()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (event !== undefined) updateData.event = event
    if (description !== undefined) updateData.description = description
    if (scriptContent !== undefined) updateData.script_content = scriptContent
    if (scriptType !== undefined) updateData.script_type = scriptType
    if (env !== undefined) updateData.env = env
    if (teams !== undefined) updateData.teams = teams
    if (isGlobal !== undefined) updateData.is_global = isGlobal
    if (status !== undefined) updateData.status = status

    const { data: hook, error } = await supabase
      .from('zeude_hooks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update hook:', error)
      return Response.json({ error: 'Failed to update hook' }, { status: 500 })
    }

    return Response.json({ hook })
  } catch (err) {
    console.error('Hook update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete hook
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('zeude_hooks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete hook:', error)
      return Response.json({ error: 'Failed to delete hook' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('Hook delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
