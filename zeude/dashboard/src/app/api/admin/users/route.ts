import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

// Sanitize search input to prevent PostgREST filter injection
function sanitizeSearch(input: string): string {
  // Remove characters that could break PostgREST or() filter syntax
  return input.replace(/[(),."'\\]/g, '').trim()
}

// GET: List all users (admin only)
export async function GET(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const url = new URL(req.url)
    const team = url.searchParams.get('team')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)
    const offset = (page - 1) * limit

    const db = getOperationalDb()
    const safeSearch = search ? sanitizeSearch(search) : ''
    const result = await db.users.listUsers({
      team,
      status,
      search: safeSearch || undefined,
      page,
      limit,
    })
    const users = result.users
    const count = result.total
    const teams = (await db.users.listTeams()).sort()

    return Response.json({
      users,
      teams,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (err) {
    console.error('User list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
