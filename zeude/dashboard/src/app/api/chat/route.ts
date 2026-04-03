import { getSession } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import {
  createChatCompletion,
  isOpenRouterConfigured,
  PROMPT_ANALYST_SYSTEM_PROMPT,
  type ChatMessage,
} from '@/lib/openrouter'
import {
  getUserPrompts,
  getUserPromptStats,
  getTeamTrends,
  getTeamPromptPatterns,
} from '@/lib/prompt-analytics'

interface ChatRequest {
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

// POST: Handle chat messages
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if OpenRouter is configured
    if (!isOpenRouterConfigured()) {
      return Response.json({
        error: 'AI chatbot is not configured. Please set OPENROUTER_API_KEY.'
      }, { status: 503 })
    }

    // Rate limiting: 20 messages per minute
    const rateLimitResult = rateLimit(`chat:${session.user.id}`, { limit: 20, windowMs: 60 * 1000 })

    if (!rateLimitResult.success) {
      return Response.json(
        { error: 'Too many requests. Please wait a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }

    const body: ChatRequest = await req.json()

    if (!body.message || typeof body.message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    // Build context based on user's message intent
    let contextData = ''
    const userMessage = body.message.toLowerCase()

    // Intent detection patterns (more robust than simple includes)
    const personalAnalysisPattern = /(?:my)\s*(?:prompt)|(?:analyze|stats).*(?:prompt)|(?:prompt).*(?:analyze)/i
    const teamPattern = /(?:team)\s*(?:trend|pattern)|(?:trend|pattern).*(?:team)/i
    const improvePattern = /(?:improve|better).*(?:prompt)|(?:prompt).*(?:improve)/i

    // Detect intent and fetch relevant data
    // Use both user.id and email for lookup (covers old data without user_id)
    const userIdentifier = { userId: session.user.id, userEmail: session.user.email }

    if (personalAnalysisPattern.test(userMessage)) {
      // User wants personal prompt analysis
      const [prompts, stats] = await Promise.all([
        getUserPrompts(userIdentifier, 20),
        getUserPromptStats(userIdentifier, 30),
      ])

      contextData = `
[User Prompt Data]
- Total prompts (last 30 days): ${stats.total_prompts}
- Average length: ${Math.round(stats.avg_length)} chars
- Sessions: ${stats.unique_sessions}
- Top projects: ${stats.top_projects.map(p => p.project.split('/').pop()).join(', ') || 'none'}

[Recent Prompt Samples]
${prompts.slice(0, 5).map((p, i) => `${i + 1}. "${p.prompt_text.substring(0, 100)}..."`).join('\n')}
`
    } else if (teamPattern.test(userMessage)) {
      // User wants team trends
      const [trends, patterns] = await Promise.all([
        getTeamTrends(session.user.team || 'default', 14),
        getTeamPromptPatterns(session.user.team || 'default', 50),
      ])

      contextData = `
[Team Trend Data - Last 14 Days]
${trends.slice(0, 7).map(t => `- ${t.date}: ${t.total_prompts} prompts, ${t.unique_users} users, avg ${Math.round(Number(t.avg_length))} chars`).join('\n')}

[Team Prompt Patterns - Recent Samples]
${patterns.slice(0, 5).map((p, i) => {
        const displayName = p.user_email ? p.user_email.split('@')[0] : (p.user_id || 'Unknown')
        return `${i + 1}. [${displayName}] "${p.prompt_text.substring(0, 80)}..."`
      }).join('\n')}
`
    } else if (improvePattern.test(userMessage)) {
      // User wants improvement suggestions
      const prompts = await getUserPrompts(userIdentifier, 10)

      contextData = `
[Improvement Request - User's Recent Prompts]
${prompts.slice(0, 5).map((p, i) => `${i + 1}. "${p.prompt_text.substring(0, 150)}${p.prompt_text.length > 150 ? '...' : ''}"`).join('\n')}
`
    }

    // Build messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPT_ANALYST_SYSTEM_PROMPT },
    ]

    // Add context if available
    if (contextData) {
      messages.push({
        role: 'system',
        content: `Here is the user's prompt data:\n${contextData}`
      })
    }

    // Add conversation history
    if (body.history && Array.isArray(body.history)) {
      for (const msg of body.history.slice(-6)) { // Keep last 6 messages for context
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    // Add current message
    messages.push({ role: 'user', content: body.message })

    // Call OpenRouter
    const completion = await createChatCompletion(messages, {
      temperature: 0.7,
      maxTokens: 1024,
    })

    const assistantMessage = completion.choices[0]?.message?.content || 'Unable to generate a response.'

    return Response.json({
      message: assistantMessage,
      usage: completion.usage,
    })
  } catch (err) {
    console.error('Chat error:', err)
    return Response.json({
      error: err instanceof Error ? err.message : 'Internal server error'
    }, { status: 500 })
  }
}
