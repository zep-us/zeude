import { createServerClient } from '@/lib/supabase'
import { randomBytes } from 'crypto'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

const AGENT_KEY_PATTERN = /^zd_[a-f0-9]{64}$/

export async function POST(req: Request) {
  try {
    // Rate limiting: 5 requests per minute per IP
    const clientIP = getClientIP(req)
    const rateLimitResult = rateLimit(`ott:${clientIP}`, { limit: 5, windowMs: 60 * 1000 })

    if (!rateLimitResult.success) {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    const { agentKey } = await req.json()

    // Validate agent key exists and matches expected format
    if (!agentKey || typeof agentKey !== 'string') {
      return Response.json({ error: 'Agent key required' }, { status: 400 })
    }

    if (!AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key format' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Find user by agent key
    const { data: user, error } = await supabase
      .from('zeude_users')
      .select('id, email, name')
      .eq('agent_key', agentKey)
      .single()

    if (error || !user) {
      console.error('User lookup failed:', { error, user, agentKey })
      return Response.json({ error: 'Invalid agent key', debug: error?.message || 'User not found' }, { status: 401 })
    }

    // Generate OTT (64 chars hex)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 1000) // 60 seconds

    // Store OTT
    const { error: insertError } = await supabase.from('zeude_one_time_tokens').insert({
      token,
      user_id: user.id,
      expires_at: expiresAt.toISOString(),
    })

    if (insertError) {
      console.error('Failed to create OTT:', insertError)
      return Response.json({ error: 'Failed to create token', debug: insertError.message }, { status: 500 })
    }

    return Response.json({ token })
  } catch (err) {
    console.error('OTT generation error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
