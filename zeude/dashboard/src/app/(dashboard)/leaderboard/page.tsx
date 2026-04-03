import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { serverFetch } from '@/lib/server-fetch'
import LeaderboardClient from './leaderboard-client'

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>
}) {
  const params = await searchParams
  const cohort = params.cohort?.trim() || ''

  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.leaderboard.filtered(cohort, 'all'),
    queryFn: async () => {
      const urlParams = new URLSearchParams()
      if (cohort) urlParams.set('cohort', cohort)
      urlParams.set('source', 'all')
      const res = await serverFetch(`/api/leaderboard?${urlParams}`)
      if (!res.ok) throw new Error(`Leaderboard prefetch failed: ${res.status}`)
      return res.json()
    },
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <LeaderboardClient initialCohort={cohort} />
    </HydrationBoundary>
  )
}
