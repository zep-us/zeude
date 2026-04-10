import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

interface RegisterCohortBody {
  cohortKey?: string
  userIds?: string[]
}

function sanitizeCohortKey(input: string): string {
  // Allow URL-safe cohort keys only
  return input.trim().replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64)
}

// POST: Register existing members into a cohort (admin only)
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as RegisterCohortBody
    const cohortKey = sanitizeCohortKey(body.cohortKey || '')

    if (!cohortKey || cohortKey.length < 3) {
      return Response.json({ error: 'Invalid cohortKey (min 3 chars, URL-safe only)' }, { status: 400 })
    }

    const db = getOperationalDb()

    const requestedUserIds = Array.isArray(body.userIds)
      ? body.userIds.filter(Boolean)
      : []

    const users = requestedUserIds.length > 0
      ? await db.users.listByIds(requestedUserIds)
      : (await db.users.listAll()).filter(user => user.status === 'active').map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
        }))

    if (!users || users.length === 0) {
      return Response.json({
        cohortKey,
        processedUsers: 0,
        insertedMembers: 0,
        totalMembers: 0,
        leaderboardUrl: `/leaderboard?cohort=${encodeURIComponent(cohortKey)}`,
      })
    }

    let insertedMembers = 0
    let totalMembers = 0
    try {
      insertedMembers = await db.cohorts.addMembers(cohortKey, users.map(user => user.id), session.user.id)
      totalMembers = await db.cohorts.countMembers(cohortKey)
    } catch (error) {
      console.error('Failed to register cohort members:', error)
      return Response.json({ error: 'Failed to register cohort members' }, { status: 500 })
    }

    return Response.json({
      cohortKey,
      processedUsers: users.length,
      insertedMembers,
      totalMembers,
      leaderboardUrl: `/leaderboard?cohort=${encodeURIComponent(cohortKey)}`,
    })
  } catch (err) {
    console.error('Cohort register error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
