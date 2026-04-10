import { getSession } from '@/lib/session'
import { randomBytes } from 'crypto'
import { getOperationalDb } from '@/lib/db'

// POST: Generate new agent key for user
export async function POST(
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
    const db = getOperationalDb()

    // Generate new agent key
    const agentKey = 'zd_' + randomBytes(32).toString('hex')

    const updated = await db.users.updateAgentKey(id, agentKey)
    if (!updated) {
      return Response.json({ error: 'Failed to regenerate key' }, { status: 500 })
    }

    return Response.json({
      agentKey,
      user: { id: updated.id, email: updated.email, name: updated.name },
      message: 'New key generated. Share securely with the user.',
    })
  } catch (err) {
    console.error('Key regeneration error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Revoke agent key (set to empty/invalid)
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

    // Prevent revoking own key
    if (id === session.user.id) {
      return Response.json({ error: 'Cannot revoke your own key' }, { status: 400 })
    }

    const db = getOperationalDb()

    // Generate a revoked key that won't match any valid format
    const revokedKey = 'revoked_' + randomBytes(16).toString('hex')

    const updated = await db.users.updateById(id, {
      agent_key: revokedKey,
      status: 'inactive',
    })
    if (!updated) {
      return Response.json({ error: 'Failed to revoke key' }, { status: 500 })
    }

    return Response.json({ success: true, message: 'Key revoked and user deactivated' })
  } catch (err) {
    console.error('Key revocation error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
