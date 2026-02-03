import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

interface OttRecord {
  id: string
  token: string
  user_id: string
  expires_at: string
  user: {
    id: string
    email: string
    name: string | null
  } | null
}

// Get the proper base URL from request headers (handles reverse proxy)
function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  return `${proto}://${host}`
}

export async function GET(request: NextRequest) {
  const ott = request.nextUrl.searchParams.get('ott')
  const baseUrl = getBaseUrl(request)

  if (!ott) {
    return NextResponse.redirect(new URL('/auth?error=missing_token', baseUrl))
  }

  const supabase = createServerClient()

  // Validate OTT
  const { data } = await supabase
    .from('zeude_one_time_tokens')
    .select('*, user:zeude_users(*)')
    .eq('token', ott)
    .gt('expires_at', new Date().toISOString())
    .single()

  const ottRecord = data as OttRecord | null

  if (!ottRecord) {
    return NextResponse.redirect(new URL('/auth?error=invalid_token', baseUrl))
  }

  // Create session (7 days)
  const sessionToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const { error: sessionError } = await supabase.from('zeude_sessions').insert({
    token: sessionToken,
    user_id: ottRecord.user_id,
    expires_at: expiresAt.toISOString(),
  })

  if (sessionError) {
    console.error('Failed to create session:', sessionError)
    return NextResponse.redirect(new URL('/auth?error=session_error', baseUrl))
  }

  console.log('[AUTH] Session created successfully:', {
    user_id: ottRecord.user_id,
    tokenPrefix: sessionToken.substring(0, 8),
    expires: expiresAt.toISOString(),
  })

  // Delete used OTT
  await supabase.from('zeude_one_time_tokens').delete().eq('id', ottRecord.id)

  // Set cookie on the redirect response
  const response = NextResponse.redirect(new URL('/', baseUrl))
  response.cookies.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })

  console.log('[AUTH] Cookie set, redirecting to /')

  return response
}
