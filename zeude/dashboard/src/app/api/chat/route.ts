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
    const personalAnalysisPattern = /(?:내|나의|my)\s*(?:프롬프트|prompt)|(?:분석|analyze|stats|통계).*(?:프롬프트|prompt)|(?:프롬프트|prompt).*(?:분석|analyze)/i
    const teamPattern = /(?:팀|team)\s*(?:트렌드|trend|패턴|pattern)|(?:트렌드|trend|패턴|pattern).*(?:팀|team)/i
    const improvePattern = /(?:개선|improve|better|더\s*잘|향상).*(?:프롬프트|prompt|방법)|(?:프롬프트|prompt).*(?:개선|improve)/i

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
[사용자 프롬프트 데이터]
- 최근 30일 총 프롬프트: ${stats.total_prompts}개
- 평균 길이: ${Math.round(stats.avg_length)}자
- 세션 수: ${stats.unique_sessions}개
- 주요 프로젝트: ${stats.top_projects.map(p => p.project.split('/').pop()).join(', ') || '없음'}

[최근 프롬프트 샘플]
${prompts.slice(0, 5).map((p, i) => `${i + 1}. "${p.prompt_text.substring(0, 100)}..."`).join('\n')}
`
    } else if (teamPattern.test(userMessage)) {
      // User wants team trends
      const [trends, patterns] = await Promise.all([
        getTeamTrends(session.user.team || 'default', 14),
        getTeamPromptPatterns(session.user.team || 'default', 50),
      ])

      contextData = `
[팀 트렌드 데이터 - 최근 14일]
${trends.slice(0, 7).map(t => `- ${t.date}: ${t.total_prompts}개 프롬프트, ${t.unique_users}명 사용자, 평균 ${Math.round(Number(t.avg_length))}자`).join('\n')}

[팀 프롬프트 패턴 - 최근 샘플]
${patterns.slice(0, 5).map((p, i) => {
        const displayName = p.user_email ? p.user_email.split('@')[0] : (p.user_id || 'Unknown')
        return `${i + 1}. [${displayName}] "${p.prompt_text.substring(0, 80)}..."`
      }).join('\n')}
`
    } else if (improvePattern.test(userMessage)) {
      // User wants improvement suggestions
      const prompts = await getUserPrompts(userIdentifier, 10)

      contextData = `
[개선 요청 - 사용자의 최근 프롬프트]
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
        content: `다음은 사용자의 프롬프트 데이터입니다:\n${contextData}`
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

    const assistantMessage = completion.choices[0]?.message?.content || '응답을 생성할 수 없습니다.'

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
