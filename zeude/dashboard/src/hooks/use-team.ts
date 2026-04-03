import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { User, UserRole } from '@/lib/database.types'

type UserWithoutKey = Omit<User, 'agent_key' | 'invited_by'>

interface TeamData {
  users: UserWithoutKey[]
  teams: string[]
}

async function fetchTeamUsers(team: string, status: string, search: string): Promise<TeamData> {
  const params = new URLSearchParams()
  if (team && team !== 'all') params.set('team', team)
  if (status && status !== 'all') params.set('status', status)
  if (search) params.set('search', search)

  const res = await fetch(`/api/admin/users?${params}`)
  if (res.status === 403) {
    window.location.href = '/unauthorized'
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error('Failed to fetch users')
  const data = await res.json()
  return { users: data.users, teams: data.teams }
}

export function useTeamUsers(team: string, status: string, search: string) {
  return useQuery({
    queryKey: queryKeys.team.filtered(team, status, search),
    queryFn: () => fetchTeamUsers(team, status, search),
    staleTime: 30_000,
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update user')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.team.all })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.team.all })
    },
  })
}

export function useGenerateInvite() {
  return useMutation({
    mutationFn: async ({ team, role }: { team: string; role: UserRole }) => {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, role }),
      })
      if (!res.ok) throw new Error('Failed to generate invite')
      return res.json() as Promise<{ url: string }>
    },
  })
}

export function useGenerateKey() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/key`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to generate key')
      return res.json() as Promise<{ agentKey: string }>
    },
  })
}

export type { UserWithoutKey, TeamData }
