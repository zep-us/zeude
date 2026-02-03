/**
 * @deprecated This API is replaced by the Skill Hint hook which uses local skill-rules.json
 * The hook reads ~/.claude/skill-rules.json (synced via zeude sync) and adds hints directly
 * without any network calls, achieving ~50ms latency vs 350ms-4s here.
 *
 * This endpoint remains for backward compatibility but will be removed in a future version.
 */
import { createServerClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import { AGENT_KEY_PATTERN } from '@/lib/prompt-utils'

interface SkillSuggestPayload {
  prompt: string
  skills: Array<{ name: string; desc: string }>
}

interface SkillMatch {
  skill: string
  confidence: number
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

// Keyword patterns for fast matching (no LLM needed)
const SKILL_KEYWORDS: Record<string, string[]> = {
  'clarify': ['clarify', 'requirement', '요구사항', '명확', 'unclear', 'ambiguous', 'specify', '정의'],
  'commit': ['commit', 'git commit', '커밋', 'stage', 'push'],
  'review-pr': ['review', 'pr', 'pull request', 'code review', '리뷰', 'PR'],
  'handoff': ['handoff', 'hand off', 'context', '핸드오프', '인수인계', 'transfer'],
  'gha': ['github action', 'gha', 'workflow', 'ci', 'cd', 'pipeline', 'build fail', 'action fail'],
}

// Words that indicate NO skill should be suggested (must match as whole word)
const NEGATIVE_KEYWORDS = ['hello', 'hi', 'hey', '안녕', 'thanks', '감사', 'bye', 'debug', 'what is', 'how to', 'explain']

// Helper: check if keyword matches as whole word (not substring)
function matchesWholeWord(text: string, keyword: string): boolean {
  // For multi-word keywords, just use includes
  if (keyword.includes(' ')) {
    return text.includes(keyword)
  }
  // For single words, use word boundary regex
  const regex = new RegExp(`\\b${keyword}\\b`, 'i')
  return regex.test(text)
}

interface KeywordResult {
  matches: SkillMatch[]
  skipLLM: boolean  // true if we're confident there's no match (negative keywords)
}

function keywordMatch(prompt: string, availableSkills: string[]): KeywordResult {
  const lower = prompt.toLowerCase()

  // Check negative keywords first - skip LLM entirely for these
  for (const neg of NEGATIVE_KEYWORDS) {
    if (matchesWholeWord(lower, neg)) {
      return { matches: [], skipLLM: true }
    }
  }

  const matches: SkillMatch[] = []

  for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
    // Only match if skill is in available skills
    if (!availableSkills.includes(skill)) continue

    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matches.push({ skill, confidence: 0.9 })
        break
      }
    }
  }

  // If we found matches, skip LLM. If no matches, try LLM as fallback.
  return { matches, skipLLM: matches.length > 0 }
}

// POST: Analyze prompt and suggest matching skills via OpenRouter proxy
export async function POST(req: Request) {
  try {
    // Extract agent key from Authorization header
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    // Rate limiting: 30 suggestions per minute per agent key (LLM calls are expensive)
    const rateLimitResult = rateLimit(`skill-suggest:${agentKey}`, { limit: 30, windowMs: 60 * 1000 })

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

    // Check OpenRouter API key
    const openRouterKey = process.env.OPENROUTER_API_KEY
    if (!openRouterKey) {
      return Response.json({ error: 'OpenRouter not configured' }, { status: 503 })
    }

    // Validate user
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
    const body: SkillSuggestPayload = await req.json()

    if (!body.prompt || !body.skills || body.skills.length === 0) {
      return Response.json({ error: 'prompt and skills are required' }, { status: 400 })
    }

    // Fast path: Try keyword matching first (no LLM needed)
    const availableSkillNames = body.skills.map(s => s.name)
    const keywordResult = keywordMatch(body.prompt, availableSkillNames)

    if (keywordResult.skipLLM) {
      // Keyword match found OR negative keyword detected - return immediately (< 10ms)
      return Response.json({ matches: keywordResult.matches })
    }

    // Slow path: Fall back to LLM for ambiguous prompts (no keyword match, no negative keywords)
    // Build LLM request
    const skillsJson = JSON.stringify(body.skills)
    const llmPayload = {
      model: 'x-ai/grok-4-fast',
      messages: [
        {
          role: 'system',
          content: `You analyze user prompts and match them to available CLI skills/commands. Return JSON only, no explanation.

Rules:
1. Only suggest skills that clearly match the user intent
2. Confidence 0.0-1.0 (0.7+ threshold for suggestion)
3. Max 4 matches
4. Return empty matches array if no good fit`
        },
        {
          role: 'user',
          content: `User prompt: "${body.prompt.slice(0, 500)}"

Available skills:
${skillsJson}

Return JSON: {"matches": [{"skill": "name", "confidence": 0.85}]}`
        }
      ],
      temperature: 0,
      max_tokens: 200
    }

    // Call OpenRouter API
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        },
        body: JSON.stringify(llmPayload),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        console.error('OpenRouter error:', response.status, await response.text())
        return Response.json({ matches: [] })
      }

      const data: OpenRouterResponse = await response.json()
      const content = data.choices?.[0]?.message?.content || ''

      // Parse matches from LLM response (handle markdown-wrapped JSON)
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      try {
        const parsed = JSON.parse(cleanContent)
        const matches: SkillMatch[] = parsed.matches || []

        // Filter to high confidence matches only
        const highConfMatches = matches.filter(m => m.confidence >= 0.7).slice(0, 4)

        return Response.json({ matches: highConfMatches })
      } catch {
        // JSON parse failed, return empty
        return Response.json({ matches: [] })
      }
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        // Timeout - return empty matches (don't block user)
        return Response.json({ matches: [] })
      }
      throw err
    }
  } catch (err) {
    console.error('Skill suggest error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
