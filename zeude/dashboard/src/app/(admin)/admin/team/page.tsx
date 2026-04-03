import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { fetchTeamData } from '@/lib/data/admin-team'
import TeamClient from './team-client'

export default async function TeamPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.team.filtered('all', 'all', ''),
    queryFn: fetchTeamData,
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <TeamClient />
    </HydrationBoundary>
  )
}
