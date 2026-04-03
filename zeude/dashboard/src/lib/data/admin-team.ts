import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function fetchTeamData() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const supabase = createServerClient()

  const { data: users, error } = await supabase
    .from('zeude_users')
    .select('id, email, name, team, role, status, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch users: ${error.message}`)

  const { data: teamsData } = await supabase
    .from('zeude_users')
    .select('team')
    .not('team', 'is', null)

  const teams = [...new Set(teamsData?.map(t => t.team) || [])].sort()

  return { users: users || [], teams }
}
