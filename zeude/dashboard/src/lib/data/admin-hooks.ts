import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

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

export async function fetchHooksData() {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  if (session.user.role !== 'admin') throw new Error('Admin access required')

  const supabase = createServerClient()

  const { data: hooks, error } = await supabase
    .from('zeude_hooks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch hooks: ${error.message}`)

  const { data: usersData } = await supabase
    .from('zeude_users')
    .select('id, name, email, team')
    .order('team')

  const teams = [...new Set(usersData?.map(u => u.team) || [])]
  const users = usersData || []

  const { data: installStatus } = await supabase
    .from('zeude_hook_install_status')
    .select('user_id, hook_id, installed, version, last_checked_at')

  // Pre-compute maps for O(1) lookups
  const userMap = new Map(users.map(u => [u.id, u]))
  const installStatusArray = installStatus || []
  const statusByHookId = installStatusArray.reduce((acc, s) => {
    if (!acc[s.hook_id]) acc[s.hook_id] = []
    acc[s.hook_id].push(s)
    return acc
  }, {} as Record<string, typeof installStatusArray>)

  const installStatusByHook: Record<string, InstallStatusSummary> = {}

  for (const hook of hooks || []) {
    const hookStatus = statusByHookId[hook.id] || []
    const applicableUsers = users.filter(u => {
      if (hook.is_global) return true
      return hook.teams.includes(u.team)
    })

    installStatusByHook[hook.id] = {
      installed: hookStatus.filter(s => s.installed).length,
      total: applicableUsers.length,
      details: applicableUsers.map(u => {
        const status = hookStatus.find(s => s.user_id === u.id)
        return {
          userId: u.id,
          userName: userMap.get(u.id)?.name || u.email,
          installed: status?.installed || false,
          version: status?.version || null,
          lastCheckedAt: status?.last_checked_at || null,
        }
      }),
    }
  }

  return { hooks, teams, installStatus: installStatusByHook }
}
