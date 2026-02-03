import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { randomBytes } from 'crypto'

export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { team, role = 'member' } = await req.json()

    if (!team || typeof team !== 'string') {
      return Response.json({ error: 'Team is required' }, { status: 400 })
    }

    if (role !== 'admin' && role !== 'member') {
      return Response.json({ error: 'Role must be admin or member' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Generate secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    const { data: invite, error } = await supabase
      .from('zeude_invites')
      .insert({
        token,
        team,
        role,
        created_by: session.user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create invite:', JSON.stringify(error, null, 2))
      console.error('Error code:', error.code, 'Message:', error.message)
      return Response.json({ error: 'Failed to create invite', details: error.message }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zeude.zep.work'

    return Response.json({
      token: invite.token,
      url: `${baseUrl}/invite/${invite.token}`,
      expiresAt: invite.expires_at,
      team: invite.team,
      role: invite.role,
    })
  } catch (err) {
    console.error('Invite creation error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const { data: invites, error } = await supabase
      .from('zeude_invites')
      .select('id, token, team, role, created_by, expires_at, used_at, used_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Failed to fetch invites:', error)
      return Response.json({ error: 'Failed to fetch invites' }, { status: 500 })
    }

    return Response.json({ invites })
  } catch (err) {
    console.error('Invite list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
