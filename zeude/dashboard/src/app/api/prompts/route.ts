import { getClickHouseClient } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import {
  AGENT_KEY_PATTERN,
  isValidUUID,
  generateUUID,
  detectPromptType,
  type PromptType,
} from '@/lib/prompt-utils'

interface PromptPayload {
  sessionId: string
  prompt: string
  cwd?: string
  timestamp?: string
  // Optional: client can explicitly specify prompt type
  promptType?: PromptType
  invokedName?: string
  // Optional: client-generated UUID for tracking updates
  promptId?: string
}

// POST: Receive prompt from CLI hook
export async function POST(req: Request) {
  try {
    // Extract agent key from Authorization header
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    // Rate limiting: 60 prompts per minute per agent key
    const rateLimitResult = rateLimit(`prompt:create:${agentKey}`, { limit: 60, windowMs: 60 * 1000 })

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
    const body: PromptPayload = await req.json()

    if (!body.prompt || typeof body.prompt !== 'string') {
      return Response.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Validate promptId format if provided
    if (body.promptId && !isValidUUID(body.promptId)) {
      return Response.json({ error: 'Invalid prompt_id format' }, { status: 400 })
    }

    // Detect prompt type (skill/command/agent/natural)
    // Client can override with explicit promptType/invokedName
    const detected = detectPromptType(body.prompt)
    const promptType = body.promptType || detected.promptType
    const invokedName = body.invokedName || detected.invokedName

    // Generate server-side UUID if client didn't provide one
    const promptId = body.promptId || generateUUID()

    // Insert into ClickHouse
    await clickhouse.insert({
      table: 'ai_prompts',
      values: [{
        prompt_id: promptId,  // Use client-provided UUID or server-generated fallback
        session_id: body.sessionId || '',
        user_id: user.id,  // Primary identifier (works for Bedrock users too)
        user_email: user.email || '',  // May be empty for Bedrock users
        team: user.team || 'default',
        timestamp: body.timestamp || new Date().toISOString(),
        prompt_text: body.prompt,
        prompt_length: body.prompt.length,
        prompt_type: promptType,
        invoked_name: invokedName,
        project_path: body.cwd || '',
        working_directory: body.cwd || '',
      }],
      format: 'JSONEachRow',
    })

    return Response.json({ success: true, stored: true, prompt_id: promptId })
  } catch (err) {
    console.error('Prompt ingestion error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
