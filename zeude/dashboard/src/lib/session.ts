import { cookies } from 'next/headers'
import { createServerClient, isDBConnectionError } from './supabase'
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
    disabled_skills: [],
    invited_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
})

// React cache로 동일 요청 내에서 세션 조회 중복 방지
export const getSession = cache(async (): Promise<SessionWithUser | null> => {
  // Skip auth in development mode — fetch real user from DB by MOCK_EMAIL
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    try {
      const mockEmail = process.env.MOCK_EMAIL || 'dev@localhost'
      const supabase = createServerClient()
      const { data: realUser } = await supabase
        .from('zeude_users')
        .select('id, email, name, agent_key, team, role, status, disabled_skills, invited_by, created_at, updated_at')
        .eq('email', mockEmail)
        .single()

      if (realUser) {
        return {
          id: 'dev-session',
          token: 'dev-token',
          user_id: realUser.id,
          expires_at: '2099-12-31T23:59:59Z',
          created_at: new Date().toISOString(),
          user: realUser,
        }
      }
    } catch {
      // DB not available — fall through to mock session
    }
    // Fallback to hardcoded mock if user not found in DB or DB unavailable
    return getDevMockSession()
  }

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (process.env.NODE_ENV === 'development') {
    console.log('[SESSION] Checking session, token exists:', !!sessionToken)
  }

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

  if (process.env.NODE_ENV === 'development') {
    console.log('[SESSION] DB query result:', { hasSession: !!session, hasUser: !!session?.user })
  }

  // DB 연결 에러(ETIMEDOUT 등)와 실제 세션 없음을 구분
  if (isDBConnectionError(error)) {
    throw new Error('DB_CONNECTION_ERROR')
  }

  if (!session || !session.user) {
    return null
  }

  return session as unknown as SessionWithUser
})

export async function getUser(): Promise<User> {
  try {
    const session = await getSession()

    if (!session?.user) {
      redirect('/auth?error=session_expired')
    }

    return session.user
  } catch (e) {
    if (e instanceof Error && e.message === 'DB_CONNECTION_ERROR') {
      redirect('/auth?error=db_connection')
    }
    throw e
  }
}

export async function requireAuth(): Promise<SessionWithUser> {
  try {
    const session = await getSession()

    if (!session) {
      redirect('/auth?error=not_authenticated')
    }

    return session
  } catch (e) {
    if (e instanceof Error && e.message === 'DB_CONNECTION_ERROR') {
      redirect('/auth?error=db_connection')
    }
    throw e
  }
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
  try {
    const session = await getSession()

    if (!session) {
      redirect('/auth?error=not_authenticated')
    }

    if (session.user.role !== 'admin') {
      redirect('/unauthorized')
    }

    return session
  } catch (e) {
    if (e instanceof Error && e.message === 'DB_CONNECTION_ERROR') {
      redirect('/auth?error=db_connection')
    }
    throw e
  }
}

export async function isAdmin(): Promise<boolean> {
  try {
    const session = await getSession()
    return session?.user?.role === 'admin'
  } catch {
    return false
  }
}
