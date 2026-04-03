import { fetchSkillsStats } from '@/lib/data/admin-skills'

// GET: Get disable statistics for all skills (admin only)
export async function GET() {
  try {
    const data = await fetchSkillsStats()
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return Response.json({ error: message }, { status: 401 })
    }
    if (message === 'Admin access required') {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('Skill stats error:', err)
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
