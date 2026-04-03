import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.NEXT_PUBLIC_APP_URL || '',
].filter(Boolean)

// Check if origin is allowed
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.startsWith(allowed))
}

// Mock API route matching (lazy-loaded only when MOCK_API=true)
async function getMockResponse(pathname: string, method: string): Promise<Record<string, unknown> | null> {
  if (method !== 'GET') {
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      if (pathname.includes('/cohorts')) return { cohortKey: 'test', processedUsers: 10, insertedMembers: 8, totalMembers: 8, leaderboardUrl: '/leaderboard?cohort=test' }
      if (pathname.includes('/mcp/test')) return { success: true, message: 'Connection OK', tools: ['tool1', 'tool2'] }
      return { success: true }
    }
    return null
  }

  const mock = await import('./app/api/mock-data')

  if (pathname === '/api/leaderboard') return mock.mockLeaderboard()
  if (pathname === '/api/admin/analytics/usage') return mock.mockAnalyticsUsage()
  if (pathname === '/api/admin/analytics/efficiency') return mock.mockEfficiency()
  if (pathname.startsWith('/api/admin/analytics/efficiency/')) return { userId: 'u1', contextGrowth: [], toolUsage: [{ tool: 'Read', requests: 120, inputTokens: 50000, outputTokens: 20000 }, { tool: 'Edit', requests: 80, inputTokens: 30000, outputTokens: 15000 }], sessionStats: { totalSessions: 45, avgSessionLength: 1200, avgGrowthRate: 1.2 } }
  if (pathname === '/api/admin/analytics/skills') return mock.mockSkillsAnalytics()
  if (pathname === '/api/admin/hooks') return mock.mockHooks()
  if (pathname === '/api/admin/skills') return mock.mockSkills()
  if (pathname === '/api/admin/skills/stats') return mock.mockSkillStats()
  if (pathname === '/api/admin/mcp') return mock.mockMCP()
  if (pathname === '/api/admin/users') return mock.mockTeamUsers()

  return null
}

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  const pathname = request.nextUrl.pathname

  // Mock API mode: return fake data without DB
  if (process.env.MOCK_API === 'true' && pathname.startsWith('/api/') && pathname !== '/api/health') {
    const mockData = await getMockResponse(pathname, request.method)
    if (mockData) {
      const response = NextResponse.json(mockData)
      if (origin && isAllowedOrigin(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
      }
      return response
    }
  }

  // Handle preflight OPTIONS requests for API routes
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const response = new NextResponse(null, { status: 204 })

    if (origin && isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Max-Age', '86400')

    return response
  }

  // Add CORS headers to API responses
  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next()

    if (origin && isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
