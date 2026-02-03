import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { randomBytes } from 'crypto'

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
    const supabase = createServerClient()

    // Generate new agent key
    const agentKey = 'zd_' + randomBytes(32).toString('hex')

    const { data: user, error } = await supabase
      .from('zeude_users')
      .update({
        agent_key: agentKey,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, email, name')
      .single()

    if (error) {
      console.error('Failed to regenerate key:', error)
      return Response.json({ error: 'Failed to regenerate key' }, { status: 500 })
    }

    return Response.json({
      agentKey,
      user,
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

    const supabase = createServerClient()

    // Generate a revoked key that won't match any valid format
    const revokedKey = 'revoked_' + randomBytes(16).toString('hex')

    const { error } = await supabase
      .from('zeude_users')
      .update({
        agent_key: revokedKey,
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('Failed to revoke key:', error)
      return Response.json({ error: 'Failed to revoke key' }, { status: 500 })
    }

    return Response.json({ success: true, message: 'Key revoked and user deactivated' })
  } catch (err) {
    console.error('Key revocation error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
