import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { fetchHooksData } from '@/lib/data/admin-hooks'
import HooksClient from './hooks-client'

export default async function HooksPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.hooks.all,
    queryFn: fetchHooksData,
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <HooksClient />
    </HydrationBoundary>
  )
}
