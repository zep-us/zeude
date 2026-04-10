import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

export async function fetchSkillsData() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const db = getOperationalDb()
  const skills = await db.skills.listAll()
  const usersData = await db.users.listAll()

  const teams = [...new Set(usersData?.map(u => u.team) || [])]

  const userMap = new Map(
    usersData?.map(u => [u.id, u.status === 'deleted' ? 'Deleted user' : (u.name || u.email)]) || []
  )

  const enrichedSkills = skills.map(skill => ({
    ...skill,
    created_by_name: skill.created_by ? (userMap.get(skill.created_by) || null) : null,
    contributor_names: (skill.contributors || [])
      .map((id: string) => userMap.get(id))
      .filter((name: string | undefined): name is string => Boolean(name)),
  }))

  const users = usersData?.map(u => ({ id: u.id, name: u.name || u.email })) || []

  return { skills: enrichedSkills, teams, users }
}

export async function fetchSkillsStats() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const db = getOperationalDb()
  const users = (await db.users.listAll()).filter(user => user.status === 'active')

  const disableCounts: Record<string, number> = {}
  const totalActiveUsers = users?.length || 0

  for (const user of users || []) {
    const disabled: string[] = user.disabled_skills || []
    for (const slug of disabled) {
      disableCounts[slug] = (disableCounts[slug] || 0) + 1
    }
  }

  return { disableCounts, totalActiveUsers }
}
