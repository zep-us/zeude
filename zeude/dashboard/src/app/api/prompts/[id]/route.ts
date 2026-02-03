import { getClickHouseClient } from '@/lib/clickhouse'
import { createServerClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import {
  AGENT_KEY_PATTERN,
  isValidUUID,
  isValidPromptType,
  type PromptType,
} from '@/lib/prompt-utils'

// PATCH payload for updating prompt_type and invoked_name
interface PatchPayload {
  prompt_type?: PromptType
  invoked_name?: string
}

// Existing prompt structure from ClickHouse
interface ExistingPrompt {
  prompt_id: string
  session_id: string
  user_id: string
  user_email: string
  team: string
  prompt_text: string
  prompt_length: number
  prompt_type: string
  invoked_name: string
  project_path: string
  working_directory: string
}

// PATCH: Update prompt_type and invoked_name for an existing prompt
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Extract agent key from Authorization header
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    // Get prompt_id from params (Next.js 15+ requires awaiting params)
    const { id: promptId } = await params

    // Validate prompt_id format
    if (!promptId || !isValidUUID(promptId)) {
      return Response.json({ error: 'Invalid prompt_id format' }, { status: 400 })
    }

    // Rate limiting: 60 updates per minute per agent key
    const rateLimitResult = rateLimit(`prompt:update:${agentKey}`, { limit: 60, windowMs: 60 * 1000 })

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
      return Response.json({ error: 'Analytics not configured' }, { status: 503 })
    }

    // Validate user - include status in select
    const supabase = createServerClient()
    const { data: user, error: userError } = await supabase
      .from('zeude_users')
      .select('id, status')
      .eq('agent_key', agentKey)
      .single()

    if (userError || !user || user.status !== 'active') {
      return Response.json({ error: 'Invalid or inactive user' }, { status: 401 })
    }

    // Parse body
    const body: PatchPayload = await req.json()

    if (!body.prompt_type && !body.invoked_name) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // Validate prompt_type if provided
    if (body.prompt_type && !isValidPromptType(body.prompt_type)) {
      return Response.json({ error: 'Invalid prompt_type' }, { status: 400 })
    }

    // Fetch existing prompt data (need all fields for append-only pattern)
    const existingPrompt = await clickhouse.query({
      query: `
        SELECT
          prompt_id, session_id, user_id, user_email, team,
          prompt_text, prompt_length, prompt_type, invoked_name,
          project_path, working_directory
        FROM ai_prompts
        WHERE prompt_id = {promptId:String} AND user_id = {userId:String}
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      query_params: {
        promptId,
        userId: user.id,
      },
      format: 'JSONEachRow',
    })

    const results = await existingPrompt.json() as ExistingPrompt[]
    if (!results || results.length === 0) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 })
    }

    const existing = results[0]

    // Insert new row with updated fields (append-only pattern for ClickHouse)
    // Use ReplacingMergeTree with ORDER BY prompt_id to deduplicate by latest timestamp
    await clickhouse.insert({
      table: 'ai_prompts',
      values: [{
        prompt_id: existing.prompt_id,
        session_id: existing.session_id,
        user_id: existing.user_id,
        user_email: existing.user_email,
        team: existing.team,
        timestamp: new Date().toISOString(),  // New timestamp for deduplication
        prompt_text: existing.prompt_text,
        prompt_length: existing.prompt_length,
        prompt_type: body.prompt_type || existing.prompt_type,
        invoked_name: body.invoked_name !== undefined ? body.invoked_name : existing.invoked_name,
        project_path: existing.project_path,
        working_directory: existing.working_directory,
      }],
      format: 'JSONEachRow',
    })

    return Response.json({ success: true, updated: true })
  } catch (err) {
    console.error('Prompt update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
