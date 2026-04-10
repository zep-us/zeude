import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

interface InstallStatusSummary {
  installed: number
  total: number
  details: Array<{
    userId: string
    userName: string
    installed: boolean
    version: string | null
    lastCheckedAt: string | null
  }>
}

export async function fetchMCPData() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const db = getOperationalDb()
  const servers = await db.mcp.listAll()
  const usersData = await db.users.listAll()

  const teams = [...new Set(usersData?.map(u => u.team) || [])]
  const users = usersData || []

  const installStatus = await db.installStatus.listMcpStatuses()

  const installStatusByServer: Record<string, InstallStatusSummary> = {}

  for (const server of servers || []) {
    const serverStatus = (installStatus || []).filter(s => s.mcp_server_id === server.id)
    const applicableUsers = users.filter(u => {
      if (server.is_global) return true
      return server.teams.includes(u.team)
    })

    installStatusByServer[server.id] = {
      installed: serverStatus.filter(s => s.installed).length,
      total: applicableUsers.length,
      details: applicableUsers.map(u => {
        const status = serverStatus.find(s => s.user_id === u.id)
        return {
          userId: u.id,
          userName: u.name || u.email,
          installed: status?.installed || false,
          version: status?.version || null,
          lastCheckedAt: status?.last_checked_at || null,
        }
      }),
    }
  }

  return { servers, teams, installStatus: installStatusByServer }
}
