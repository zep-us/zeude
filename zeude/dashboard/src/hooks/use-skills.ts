import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Skill } from '@/lib/database.types'

interface SkillsData {
  skills: Skill[]
  teams: string[]
  users: { id: string; name: string }[]
  disableCounts: Record<string, number>
  totalActiveUsers: number
}

async function fetchSkills(): Promise<SkillsData> {
  const [skillsRes, statsRes] = await Promise.all([
    fetch('/api/admin/skills'),
    fetch('/api/admin/skills/stats'),
  ])
  const skillsData = await skillsRes.json()
  const statsData = await statsRes.json()

  return {
    skills: skillsRes.ok ? skillsData.skills : [],
    teams: skillsRes.ok ? skillsData.teams : [],
    users: skillsRes.ok ? (skillsData.users || []) : [],
    disableCounts: statsRes.ok ? (statsData.disableCounts || {}) : {},
    totalActiveUsers: statsRes.ok ? (statsData.totalActiveUsers || 0) : 0,
  }
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills.all,
    queryFn: fetchSkills,
    staleTime: 30_000,
  })
}

export function useSaveSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string | null; data: Record<string, unknown>; method?: string }) => {
      const url = id ? `/api/admin/skills/${id}` : '/api/admin/skills'
      const method = id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to save skill')
      return result
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all })
    },
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/skills/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete skill')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all })
    },
  })
}

export type { SkillsData }
