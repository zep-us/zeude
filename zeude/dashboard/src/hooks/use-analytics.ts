import { useQuery, useMutation } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { SourceBreakdown, SourceTrendPoint, UserSourceUsage } from '@/lib/source-types'

// --- Types ---

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  cacheHitRate: number
  totalRequests: number
}

export interface UserUsage {
  userId: string
  userName: string
  team: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cost: number
  cacheHitRate: number
  requestCount: number
}

export interface TrendPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cost: number
}

export interface UsagePagination {
  page: number
  pageSize: number
  totalUsers: number
  totalPages: number
  search: string
}

export interface UserEfficiency {
  userId: string
  userName: string
  cacheHitRate: number
  avgInputPerRequest: number
  contextGrowthRate: number
  retryDensity: number
  efficiencyScore: number
  costEfficiency?: number
  workQuality?: number
  contextEfficiency?: number
  tips: string[]
}

export interface ContextGrowthPoint {
  date: string
  sessionCount: number
  avgGrowthRate: number
  avgSessionLength: number
}

export interface ToolUsage {
  tool: string
  requests: number
  inputTokens: number
  outputTokens: number
}

export interface UserInsights {
  userId: string
  contextGrowth: ContextGrowthPoint[]
  toolUsage: ToolUsage[]
  sessionStats: {
    totalSessions: number
    avgSessionLength: number
    avgGrowthRate: number
  }
}

export interface PromptTypeStats {
  prompt_type: string
  count: number
  percentage: number
}

export interface SkillUsage {
  invoked_name: string
  count: number
  last_used: string
}

export interface SkillData {
  promptTypeStats: PromptTypeStats[]
  topSkills: SkillUsage[]
  adoptionRate: {
    total_users: number
    skill_users: number
    adoption_rate: number
  }
}

export interface CohortRegisterResult {
  cohortKey: string
  processedUsers: number
  insertedMembers: number
  totalMembers: number
  leaderboardUrl: string
}

export interface AnalyticsOverviewData {
  usageData: {
    summary: UsageSummary | null
    trend: TrendPoint[]
    sourceBreakdown: SourceBreakdown[]
    trendBySource: SourceTrendPoint[]
    byUserBySource: UserSourceUsage[]
  }
  efficiencyData: {
    byUser: UserEfficiency[]
  }
  skillsData: SkillData | null
}

// --- Fetch functions ---

async function fetchOverview(period: string, source: string, compare: boolean): Promise<AnalyticsOverviewData> {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const [usageRes, efficiencyRes, skillsRes] = await Promise.all([
    fetch(`/api/admin/analytics/usage?period=${period}&overviewOnly=1&source=${source}${compare ? '&compare=true' : ''}`),
    fetch(`/api/admin/analytics/efficiency?source=${source}`),
    fetch(`/api/admin/analytics/skills?days=${days}`),
  ])

  if (usageRes.status === 403 || efficiencyRes.status === 403 || skillsRes.status === 403) {
    throw new Error('Forbidden')
  }

  const usageData = usageRes.ok ? await usageRes.json() : { summary: null, trend: [], sourceBreakdown: [], trendBySource: [], byUserBySource: [] }
  const efficiencyData = efficiencyRes.ok ? await efficiencyRes.json() : { byUser: [] }
  const skillsData = skillsRes.ok ? await skillsRes.json() : null

  return {
    usageData: {
      summary: usageData.summary ?? null,
      trend: usageData.trend ?? [],
      sourceBreakdown: usageData.sourceBreakdown ?? [],
      trendBySource: usageData.trendBySource ?? [],
      byUserBySource: usageData.byUserBySource ?? [],
    },
    efficiencyData: {
      byUser: efficiencyData.byUser ?? [],
    },
    skillsData,
  }
}

async function fetchUserUsage(period: string, page: number, search: string): Promise<{ byUser: UserUsage[]; pagination: UsagePagination }> {
  const params = new URLSearchParams({ period, usersOnly: '1', page: String(page), pageSize: '50' })
  if (search) params.set('search', search)

  const res = await fetch(`/api/admin/analytics/usage?${params.toString()}`)
  if (res.status === 403) {
    throw new Error('Forbidden')
  }

  const data = await res.json()
  return {
    byUser: data.byUser ?? [],
    pagination: data.pagination ?? { page: 1, pageSize: 50, totalUsers: 0, totalPages: 1, search: '' },
  }
}

async function fetchUserInsights(userId: string, source: string): Promise<UserInsights> {
  const res = await fetch(`/api/admin/analytics/efficiency/${userId}?source=${source}`)
  if (!res.ok) throw new Error('Failed to fetch user insights')
  return res.json()
}

async function registerCohort(cohortKey: string): Promise<CohortRegisterResult> {
  const res = await fetch('/api/admin/cohorts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cohortKey }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to register cohort')
  }
  return res.json()
}

// --- Hooks ---

export function useAnalyticsOverview(period: string, source: string, compare: boolean) {
  return useQuery({
    queryKey: queryKeys.analytics.overview(period, source, compare),
    queryFn: () => fetchOverview(period, source, compare),
    staleTime: 60_000,
  })
}

export function useUserUsage(period: string, page: number, search: string) {
  return useQuery({
    queryKey: queryKeys.analytics.userUsage(period, page, search),
    queryFn: () => fetchUserUsage(period, page, search),
    staleTime: 60_000,
  })
}

export function useUserInsights(userId: string | null, source: string) {
  return useQuery({
    queryKey: queryKeys.analytics.userInsights(userId ?? '', source),
    queryFn: () => fetchUserInsights(userId!, source),
    enabled: !!userId,
    staleTime: 120_000,
  })
}

export function useRegisterCohort() {
  return useMutation({
    mutationFn: (cohortKey: string) => registerCohort(cohortKey),
  })
}
