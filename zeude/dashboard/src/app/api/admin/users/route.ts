import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

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

    const supabase = createServerClient()

    // Single query with count to avoid N+1
    let query = supabase
      .from('zeude_users')
      .select('id, email, name, team, role, status, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (team) {
      query = query.eq('team', team)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (search) {
      const safeSearch = sanitizeSearch(search)
      if (safeSearch.length > 0) {
        query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
      }
    }

    const { data: users, error, count } = await query

    if (error) {
      console.error('Failed to fetch users:', error)
      return Response.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get unique teams using DISTINCT via RPC or separate optimized query
    const { data: teamsData } = await supabase
      .from('zeude_users')
      .select('team')
      .not('team', 'is', null)

    const teams = [...new Set(teamsData?.map(t => t.team) || [])].sort()

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
