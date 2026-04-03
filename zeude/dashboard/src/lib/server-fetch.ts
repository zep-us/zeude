import { headers } from 'next/headers'

/**
 * Server-side fetch that forwards auth cookies to internal API routes.
 * Use this in server components to prefetch data for React Query hydration.
 */
export async function serverFetch(path: string): Promise<Response> {
  const headersList = await headers()
  const cookie = headersList.get('cookie') || ''
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || 'http'
  const baseUrl = `${protocol}://${host}`

  return fetch(`${baseUrl}${path}`, {
    headers: { cookie },
    cache: 'no-store',
  })
}
