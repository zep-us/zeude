import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { getClickHouseClient } from '@/lib/clickhouse'

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

    // Validate role
    if (updates.role && !['admin', 'member'].includes(updates.role)) {
      return Response.json({ error: 'Role must be admin or member' }, { status: 400 })
    }

    // Validate status
    if (updates.status && !['active', 'inactive'].includes(updates.status)) {
      return Response.json({ error: 'Status must be active or inactive' }, { status: 400 })
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

// DELETE: Hard delete user and all associated data
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

    // 1. Get user info for ClickHouse deletion
    const { data: user, error: fetchError } = await supabase
      .from('zeude_users')
      .select('id, email')
      .eq('id', id)
      .single()

    if (fetchError || !user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // 2. Update skills created_by to NULL (before deleting user)
    const { error: skillsError } = await supabase
      .from('zeude_skills')
      .update({ created_by: null })
      .eq('created_by', id)

    if (skillsError) {
      console.error('Failed to update skills:', skillsError)
      // Continue with deletion - skills update is not critical
    }

    // 3. Delete ClickHouse event/log data
    const clickhouse = getClickHouseClient()
    if (clickhouse) {
      try {
        await clickhouse.command({
          query: `
            ALTER TABLE claude_code_logs DELETE WHERE
              LogAttributes['user.email'] = {userEmail:String}
              OR ResourceAttributes['zeude.user.email'] = {userEmail:String}
              OR ResourceAttributes['zeude.user.id'] = {userId:String}
          `,
          query_params: { userEmail: user.email, userId: user.id },
        })
      } catch (chError) {
        console.error('Failed to delete ClickHouse data:', chError)
        // Continue with deletion - CH data is not critical for user deletion
      }
    }

    // 4. Delete user from Supabase (cascades to sessions, tokens, install_status)
    const { error: deleteError } = await supabase
      .from('zeude_users')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Failed to delete user:', deleteError)
      return Response.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('User delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
