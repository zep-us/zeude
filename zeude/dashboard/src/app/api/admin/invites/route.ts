import { getOperationalDb } from '@/lib/db'
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

    // Validate team name format: alphanumeric, hyphens, underscores only
    // Prevents PostgREST filter injection when team is used in .or() queries
    if (!/^[A-Za-z0-9_-]+$/.test(team)) {
      return Response.json({ error: 'Team name must contain only letters, numbers, hyphens, and underscores' }, { status: 400 })
    }

    if (role !== 'admin' && role !== 'member') {
      return Response.json({ error: 'Role must be admin or member' }, { status: 400 })
    }

    // Generate secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    const db = getOperationalDb()

    let invite
    try {
      invite = await db.invites.create({
        token,
        team,
        role,
        created_by: session.user.id,
        expires_at: expiresAt.toISOString(),
        used_at: null,
        used_by: null,
      })
    } catch (error) {
      console.error('Failed to create invite:', error)
      return Response.json({ error: 'Failed to create invite' }, { status: 500 })
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

    const db = getOperationalDb()
    const invites = await db.invites.listRecent(50)

    return Response.json({ invites })
  } catch (err) {
    console.error('Invite list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
