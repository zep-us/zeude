import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// PATCH: Update MCP server
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

    // Only allow updating specific fields
    const allowedFields = ['name', 'command', 'args', 'env', 'teams', 'is_global', 'status']
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // If is_global is true, clear teams
    if (updates.is_global === true) {
      updates.teams = []
    }

    updates.updated_at = new Date().toISOString()

    const supabase = createServerClient()

    const { data: server, error } = await supabase
      .from('zeude_mcp_servers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update MCP server:', error)
      return Response.json({ error: 'Failed to update server' }, { status: 500 })
    }

    return Response.json({ server })
  } catch (err) {
    console.error('MCP update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete MCP server
export async function DELETE(
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
    const supabase = createServerClient()

    const { error } = await supabase
      .from('zeude_mcp_servers')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete MCP server:', error)
      return Response.json({ error: 'Failed to delete server' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('MCP delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
