import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

// GET: Get single user details
export async function GET(
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

    if (!isValidUUID(id)) {
      return Response.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: user, error } = await supabase
      .from('zeude_users')
      .select('id, email, name, team, role, status, invited_by, created_at, updated_at')
      .eq('id', id)
      .single()

    if (error || !user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    return Response.json({ user })
  } catch (err) {
    console.error('User fetch error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Update user (team, role, status)
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

    if (!isValidUUID(id)) {
      return Response.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    const body = await req.json()

    // Only allow updating specific fields
    const allowedFields = ['team', 'role', 'status', 'name']
    const updates: Record<string, string> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate team name format if provided
    // Prevents PostgREST filter injection when team is used in .or() queries
    if (updates.team && !/^[A-Za-z0-9_-]+$/.test(updates.team)) {
      return Response.json({ error: 'Team name must contain only letters, numbers, hyphens, and underscores' }, { status: 400 })
    }

    // Validate role
    if (updates.role && !['admin', 'member'].includes(updates.role)) {
      return Response.json({ error: 'Role must be admin or member' }, { status: 400 })
    }

    // Validate status (deleted is only set via DELETE endpoint)
    if (updates.status && !['active', 'inactive'].includes(updates.status)) {
      return Response.json({ error: 'Status must be active or inactive' }, { status: 400 })
    }

    // Prevent restoring a deleted user via PATCH
    const supabaseCheck = createServerClient()
    const { data: targetUser } = await supabaseCheck
      .from('zeude_users')
      .select('status')
      .eq('id', id)
      .single()

    if (targetUser?.status === 'deleted') {
      return Response.json({ error: 'Cannot modify a deleted user' }, { status: 400 })
    }

    // Prevent admin from demoting themselves
    if (id === session.user.id && updates.role === 'member') {
      return Response.json({ error: 'Cannot demote yourself' }, { status: 400 })
    }

    // Prevent admin from deactivating themselves
    if (id === session.user.id && updates.status === 'inactive') {
      return Response.json({ error: 'Cannot deactivate yourself' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: user, error } = await supabase
      .from('zeude_users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, name, team, role, status')
      .single()

    if (error) {
      console.error('Failed to update user:', error)
      return Response.json({ error: 'Failed to update user' }, { status: 500 })
    }

    return Response.json({ user })
  } catch (err) {
    console.error('User update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Soft delete user (set status to 'deleted')
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

    if (!isValidUUID(id)) {
      return Response.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    // Prevent admin from deleting themselves
    if (id === session.user.id) {
      return Response.json({ error: 'Cannot delete yourself' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: user, error } = await supabase
      .from('zeude_users')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .neq('status', 'deleted')
      .select('id, email, name, status')
      .single()

    if (error || !user) {
      console.error('Failed to delete user:', error)
      return Response.json({ error: 'User not found or already deleted' }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('User delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
