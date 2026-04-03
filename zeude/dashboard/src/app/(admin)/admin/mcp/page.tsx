import { HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { dehydrateSuccessOnly } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { fetchMCPData } from '@/lib/data/admin-mcp'
import MCPClient from './mcp-client'

export default async function MCPPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.mcp.all,
    queryFn: fetchMCPData,
  })

  return (
    <HydrationBoundary state={dehydrateSuccessOnly(queryClient)}>
      <MCPClient />
    </HydrationBoundary>
  )
}
