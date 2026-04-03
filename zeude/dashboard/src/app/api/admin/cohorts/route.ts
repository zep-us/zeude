import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

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

    const supabase = createServerClient()

    const requestedUserIds = Array.isArray(body.userIds)
      ? body.userIds.filter(Boolean)
      : []

    let usersQuery = supabase.from('zeude_users').select('id')
    if (requestedUserIds.length > 0) {
      usersQuery = usersQuery.in('id', requestedUserIds)
    } else {
      usersQuery = usersQuery.eq('status', 'active')
    }

    const { data: users, error: usersError } = await usersQuery
    if (usersError) {
      console.error('Failed to fetch users for cohort register:', usersError)
      return Response.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return Response.json({
        cohortKey,
        processedUsers: 0,
        insertedMembers: 0,
        totalMembers: 0,
        leaderboardUrl: `/leaderboard?cohort=${encodeURIComponent(cohortKey)}`,
      })
    }

    const rows = users.map(user => ({
      cohort_key: cohortKey,
      user_id: user.id,
      created_by: session.user.id,
    }))

    const { count: insertedMembers, error: insertError } = await supabase
      .from('zeude_cohort_members')
      .upsert(rows, { onConflict: 'cohort_key,user_id', ignoreDuplicates: true, count: 'exact' })

    if (insertError) {
      console.error('Failed to upsert cohort members:', insertError)
      return Response.json({ error: 'Failed to register cohort members' }, { status: 500 })
    }

    const { count: totalMembers, error: totalError } = await supabase
      .from('zeude_cohort_members')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_key', cohortKey)

    if (totalError) {
      console.error('Failed to count cohort members:', totalError)
      return Response.json({ error: 'Failed to read cohort members' }, { status: 500 })
    }

    return Response.json({
      cohortKey,
      processedUsers: users.length,
      insertedMembers: insertedMembers || 0,
      totalMembers: totalMembers || 0,
      leaderboardUrl: `/leaderboard?cohort=${encodeURIComponent(cohortKey)}`,
    })
  } catch (err) {
    console.error('Cohort register error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
