import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Hook } from '@/lib/database.types'

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

interface HooksData {
  hooks: Hook[]
  teams: string[]
  installStatus: Record<string, InstallStatusSummary>
}

async function fetchHooks(): Promise<HooksData> {
  const res = await fetch('/api/admin/hooks')
  if (!res.ok) throw new Error('Failed to fetch hooks')
  const data = await res.json()
  return {
    hooks: data.hooks,
    teams: data.teams,
    installStatus: data.installStatus || {},
  }
}

export function useHooks() {
  return useQuery({
    queryKey: queryKeys.hooks.all,
    queryFn: fetchHooks,
    staleTime: 30_000,
  })
}

export function useSaveHook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string | null; data: Record<string, unknown> }) => {
      const url = id ? `/api/admin/hooks/${id}` : '/api/admin/hooks'
      const method = id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to save hook')
      return result
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.hooks.all })
    },
  })
}

export function useDeleteHook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/hooks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete hook')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.hooks.all })
    },
  })
}

export type { HooksData, InstallStatusSummary }
