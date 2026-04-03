import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { serverFetch } from '@/lib/server-fetch'
import AnalyticsClient from './analytics-client'

export default async function AnalyticsPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.analytics.overview('7d', 'all', false),
    queryFn: async () => {
      const [usageRes, efficiencyRes, skillsRes] = await Promise.all([
        serverFetch('/api/admin/analytics/usage?period=7d&overviewOnly=1&source=all'),
        serverFetch('/api/admin/analytics/efficiency?source=all'),
        serverFetch('/api/admin/analytics/skills?days=7'),
      ])
      if (!usageRes.ok) throw new Error(`Analytics prefetch failed: ${usageRes.status}`)
      const usageData = await usageRes.json()
      const efficiencyData = efficiencyRes.ok ? await efficiencyRes.json() : { byUser: [] }
      const skillsData = skillsRes.ok ? await skillsRes.json() : null
      return { usageData, efficiencyData, skillsData }
    },
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <AnalyticsClient />
    </HydrationBoundary>
  )
}
