import { getClickHouseClient } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import { AGENT_KEY_PATTERN } from '@/lib/prompt-utils'

interface SkillSuggestionPayload {
  prompt: string
  suggested_skill: string
  confidence: number
  auto_executed: boolean
  selected_skill?: string  // If user selected from multiple options
}

// POST: Log skill suggestion event
export async function POST(req: Request) {
  try {
    // Extract agent key from Authorization header
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    // Rate limiting: 60 suggestions per minute per agent key
    const rateLimitResult = rateLimit(`skill-suggestion:${agentKey}`, { limit: 60, windowMs: 60 * 1000 })

    if (!rateLimitResult.success) {
      return Response.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }

    // Get ClickHouse client
    const clickhouse = getClickHouseClient()
    if (!clickhouse) {
      // ClickHouse not configured, silently succeed
      return Response.json({ success: true, stored: false })
    }

    // Validate user
    const supabase = createServerClient()
    const { data: user, error: userError } = await supabase
      .from('zeude_users')
      .select('id, email, team, status')
      .eq('agent_key', agentKey)
      .single()

    if (userError || !user || user.status !== 'active') {
      return Response.json({ error: 'Invalid or inactive user' }, { status: 401 })
    }

    // Parse body
    const body: SkillSuggestionPayload = await req.json()

    if (!body.prompt || !body.suggested_skill) {
      return Response.json({ error: 'prompt and suggested_skill are required' }, { status: 400 })
    }

    // Insert into ClickHouse (skill_suggestions table)
    await clickhouse.insert({
      table: 'skill_suggestions',
      values: [{
        user_id: user.id,
        user_email: user.email || '',
        team: user.team || 'default',
        timestamp: new Date().toISOString(),
        prompt_text: body.prompt.slice(0, 1000),  // Limit prompt length
        suggested_skill: body.suggested_skill,
        confidence: body.confidence,
        auto_executed: body.auto_executed,
        selected_skill: body.selected_skill || '',
      }],
      format: 'JSONEachRow',
    })

    return Response.json({ success: true, stored: true })
  } catch (err) {
    console.error('Skill suggestion logging error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
