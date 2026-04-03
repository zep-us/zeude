import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { fetchSkillsData, fetchSkillsStats } from '@/lib/data/admin-skills'
import SkillsClient from './skills-client'

export default async function SkillsPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.skills.all,
    queryFn: async () => {
      const [skillsData, statsData] = await Promise.all([
        fetchSkillsData(),
        fetchSkillsStats().catch(() => ({ disableCounts: {}, totalActiveUsers: 0 })),
      ])
      return {
        skills: skillsData.skills ?? [],
        teams: skillsData.teams ?? [],
        users: skillsData.users ?? [],
        disableCounts: statsData.disableCounts ?? {},
        totalActiveUsers: statsData.totalActiveUsers ?? 0,
      }
    },
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <SkillsClient />
    </HydrationBoundary>
  )
}
