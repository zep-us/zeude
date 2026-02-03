import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import {
  getTeamPromptTypeStats,
  getTeamTopSkills,
  getSkillUsageTrend,
  getSkillAdoptionRate,
} from '@/lib/prompt-analytics'

// GET: Fetch skill usage analytics for admin
export async function GET(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if user is admin
    const supabase = createServerClient()
    const { data: user } = await supabase
      .from('zeude_users')
      .select('role, team')
      .eq('id', session.user_id)
      .single()

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '30')
    // Admin sees all teams
    const team = 'all'

    // Fetch all skill analytics in parallel
    const [promptTypeStats, topSkills, usageTrend, adoptionRate] = await Promise.all([
      getTeamPromptTypeStats(team, days),
      getTeamTopSkills(team, days, 20),
      getSkillUsageTrend(team, Math.min(days, 14)),
      getSkillAdoptionRate(team, days),
    ])

    return Response.json({
      promptTypeStats,
      topSkills,
      usageTrend,
      adoptionRate,
      period: `${days}d`,
    })
  } catch (err) {
    console.error('Skill analytics error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
