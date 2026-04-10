import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

// PATCH: Update MCP server (authenticated)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    // Only allow updating specific fields
    const allowedFields = ['name', 'url', 'command', 'args', 'env', 'teams', 'is_global', 'status']
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

    const db = getOperationalDb()
    const server = await db.mcp.updateById(id, updates)
    if (!server) {
      return Response.json({ error: 'Failed to update server' }, { status: 500 })
    }

    return Response.json({ server })
  } catch (err) {
    console.error('MCP update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete MCP server (authenticated)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const db = getOperationalDb()
    const deleted = await db.mcp.deleteById(id)
    if (!deleted) {
      return Response.json({ error: 'Failed to delete server' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('MCP delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
