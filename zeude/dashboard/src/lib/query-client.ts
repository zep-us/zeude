import { QueryClient, dehydrate, type DehydratedState } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

// Only dehydrate successful queries (v5 default includes errors, which breaks client hydration)
export function dehydrateSuccessOnly(queryClient: QueryClient): DehydratedState {
  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => query.state.status === 'success',
  })
}
