import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

interface LeaderboardUser {
  rank: number
  userName: string
  userId: string
  value: number
  formattedValue: string
}

interface SkillLeaderboardEntry {
  rank: number
  skillName: string
  description: string
  usageCount: number
  userCount: number
  topUsers?: string[]
  formattedValue: string
}

interface LeaderboardData {
  topTokenUsers: LeaderboardUser[]
  previousTopTokenUsers: LeaderboardUser[]
  topSkills: SkillLeaderboardEntry[]
  weekWindow: {
    currentStart: string
    currentEnd: string
    previousStart: string
    previousEnd: string
    nextReset: string
    timezone: 'Asia/Seoul'
  }
  cohort?: {
    cohortKey: string
    memberCount: number
    startedAt?: string
    skillDayStart?: string
    skillDayEnd?: string
  }
  updatedAt: string
}

async function fetchLeaderboard(cohort: string, source: string): Promise<LeaderboardData> {
  const params = new URLSearchParams()
  if (cohort) params.set('cohort', cohort)
  params.set('source', source)
  const query = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`/api/leaderboard${query}`)
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json()
}

export function useLeaderboard(cohort: string, source: string) {
  return useQuery({
    queryKey: queryKeys.leaderboard.filtered(cohort, source),
    queryFn: () => fetchLeaderboard(cohort, source),
    staleTime: 30_000,
    refetchInterval: cohort ? 60_000 : false,
    refetchIntervalInBackground: false,
  })
}

export type { LeaderboardData, LeaderboardUser, SkillLeaderboardEntry }
