import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

export async function fetchTeamData() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const db = getOperationalDb()
  const users = (await db.users.listAll()).map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    team: user.team,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }))
  const teams = (await db.users.listTeams()).sort()

  return { users, teams }
}
