import { randomBytes } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'
import { getOperationalDb } from '@/lib/db'

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET: Validate invite token (public)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token || token.length !== 64) {
      return Response.json({ valid: false, reason: 'invalid_format' }, { status: 400 })
    }

    const db = getOperationalDb()
    const invite = db.invites.findByToken(token)

    if (!invite) {
      return Response.json({ valid: false, reason: 'not_found' })
    }

    if (invite.used_at) {
      return Response.json({ valid: false, reason: 'used' })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return Response.json({ valid: false, reason: 'expired' })
    }

    return Response.json({
      valid: true,
      team: invite.team,
      role: invite.role,
      expiresAt: invite.expires_at,
    })
  } catch (err) {
    console.error('Invite validation error:', err)
    return Response.json({ valid: false, reason: 'error' }, { status: 500 })
  }
}

// POST: Accept invite and create user (public)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Rate limiting: 5 invite attempts per minute per token
    const rateLimitResult = rateLimit(`invite:${token}`, { limit: 5, windowMs: 60 * 1000 })
    if (!rateLimitResult.success) {
      return Response.json(
        { error: 'Too many attempts' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }

    const { name, email } = await req.json()

    if (!token || token.length !== 64) {
      return Response.json({ error: 'Invalid token format' }, { status: 400 })
    }

    if (!name || typeof name !== 'string' || name.length < 2) {
      return Response.json({ error: 'Name is required (min 2 chars)' }, { status: 400 })
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const db = getOperationalDb()

    // ATOMIC: Claim invite FIRST using update-first pattern to prevent race condition
    // This ensures only one request can successfully claim an unused, non-expired invite
    const claimedInvite = db.invites.claimByToken(token, new Date().toISOString())

    if (!claimedInvite) {
      // Could be: not found, already used, or expired
      // Check which case for better error message
      const invite = db.invites.findByToken(token)

      if (!invite) {
        return Response.json({ error: 'Invite not found' }, { status: 404 })
      }
      if (invite.used_at) {
        return Response.json({ error: 'Invite already used' }, { status: 409 })
      }
      if (new Date(invite.expires_at) < new Date()) {
        return Response.json({ error: 'Invite expired' }, { status: 400 })
      }
      return Response.json({ error: 'Failed to claim invite' }, { status: 500 })
    }

    // Check if email already exists
    const existingUser = db.users.findByEmail(email.toLowerCase())

    if (existingUser) {
      // Rollback: unmark the invite since we can't create the user
      db.invites.resetClaim(claimedInvite.id)
      return Response.json({ error: 'Email already registered' }, { status: 400 })
    }

    // Generate agent key (zd_ + 32 bytes hex = zd_ + 64 chars)
    const agentKey = 'zd_' + randomBytes(32).toString('hex')

    // Create user
    let newUser
    try {
      newUser = db.users.create({
        email: email.toLowerCase(),
        name,
        agent_key: agentKey,
        team: claimedInvite.team,
        role: claimedInvite.role,
        status: 'active',
        disabled_skills: [],
        invited_by: claimedInvite.created_by,
      })
    } catch (userError) {
      console.error('Failed to create user:', userError)
      // Rollback: unmark the invite
      db.invites.resetClaim(claimedInvite.id)
      return Response.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Update invite with the user ID who used it
    db.invites.markUsedBy(claimedInvite.id, newUser.id)

    return Response.json({
      agentKey,
      message: 'Save this key - it will not be shown again',
      team: claimedInvite.team,
      role: claimedInvite.role,
    })
  } catch (err) {
    console.error('Invite acceptance error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
