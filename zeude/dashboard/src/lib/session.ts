import { cookies } from 'next/headers'
import { createServerClient } from './supabase'
import type { User } from './database.types'
import { redirect } from 'next/navigation'
import { cache } from 'react'

interface SessionWithUser {
  id: string
  token: string
  user_id: string
  expires_at: string
  created_at: string
  user: User
}

// Development mode mock user (skip auth locally)
// Use MOCK_EMAIL env var to query real data from ClickHouse
const getDevMockSession = (): SessionWithUser => ({
  id: 'dev-session',
  token: 'dev-token',
  user_id: 'dev-user',
  expires_at: '2099-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  user: {
    id: 'dev-user',
    email: process.env.MOCK_EMAIL || 'dev@localhost',
    name: 'Dev User',
    agent_key: 'zd_dev',
    team: process.env.MOCK_TEAM || 'dev',
    role: 'admin',
    status: 'active',
    invited_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
})

// React cache로 동일 요청 내에서 세션 조회 중복 방지
export const getSession = cache(async (): Promise<SessionWithUser | null> => {
  // Skip auth in development mode
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return getDevMockSession()
  }

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  console.log('[SESSION] Checking session, token exists:', !!sessionToken, sessionToken ? sessionToken.substring(0, 8) : 'none')

  if (!sessionToken) {
    return null
  }

  const supabase = createServerClient()

  // 필요한 컬럼만 선택하여 데이터 전송량 감소
  const { data: session, error } = await supabase
    .from('zeude_sessions')
    .select('id, token, user_id, expires_at, created_at, user:zeude_users(id, email, name, team, role, status, created_at)')
    .eq('token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single()

  console.log('[SESSION] DB query result:', { hasSession: !!session, hasUser: !!session?.user, error })

  if (!session || !session.user) {
    return null
  }

  return session as unknown as SessionWithUser
})

export async function getUser(): Promise<User> {
  const session = await getSession()

  if (!session?.user) {
    redirect('/auth?error=session_expired')
  }

  return session.user
}

export async function requireAuth(): Promise<SessionWithUser> {
  const session = await getSession()

  if (!session) {
    redirect('/auth?error=not_authenticated')
  }

  return session
}

export async function logout() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (sessionToken) {
    const supabase = createServerClient()
    await supabase.from('zeude_sessions').delete().eq('token', sessionToken)
    cookieStore.delete('session')
  }
}

export async function requireAdmin(): Promise<SessionWithUser> {
  const session = await getSession()

  if (!session) {
    redirect('/auth?error=not_authenticated')
  }

  if (session.user.role !== 'admin') {
    redirect('/unauthorized')
  }

  return session
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession()
  return session?.user?.role === 'admin'
}
