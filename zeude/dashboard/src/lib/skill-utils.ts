/**
 * Skill utility functions for keyword/hint generation
 */

// Skills excluded from suggestions and leaderboard stats
// These are internal/testing skills that shouldn't count towards user metrics
export const EXCLUDED_SKILLS = ['rate-limit-options'] as const

// Check if skill content has allowed-tools (making it a command, not a skill)
export function hasAllowedTools(content: string): boolean {
  // Check YAML frontmatter for allowed-tools or allowed_tools
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return false

  const frontmatter = frontmatterMatch[1]
  return /allowed[-_]tools\s*:/i.test(frontmatter)
}

// Extract description from content if available
export function extractDescription(content: string): string | null {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const descMatch = frontmatterMatch[1].match(/description\s*:\s*(.+)/i)
  return descMatch ? descMatch[1].trim() : null
}

interface SkillRulesResult {
  keywords: string[]
  hint: string
}

// Generate keywords and hint from skill content using LLM
export async function generateSkillRules(
  skillName: string,
  skillDescription: string | null,
  skillContent: string
): Promise<SkillRulesResult> {
  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (!openRouterKey) {
    console.warn('OPENROUTER_API_KEY not set, using fallback')
    return {
      keywords: [skillName.toLowerCase()],
      hint: skillDescription || `Use /${skillName} skill`,
    }
  }

  // Truncate content to avoid token limits
  const truncatedContent = skillContent.slice(0, 2000)

  const payload = {
    model: 'x-ai/grok-4-fast',
    messages: [
      {
        role: 'system',
        content: `You analyze CLI skill definitions and generate trigger keywords for matching user prompts.

Rules for keywords:
1. Include 10-15 keywords (Korean AND English)
2. MUST include single-word triggers (e.g., "slack", "슬랙", "github", "깃허브")
3. Include common phrases users might say (e.g., "이슈 만들어", "PR 리뷰")
4. Include verb variations (e.g., "보내줘", "전송", "공유")
5. Prefer shorter, more general keywords over long specific phrases
6. Keywords should match substring - "슬랙" will match "슬랙으로 보내줘"

Return JSON only: {"keywords": ["word1", "word2", ...], "hint": "1-2 sentence guidance"}`
      },
      {
        role: 'user',
        content: `Skill name: ${skillName}
Description: ${skillDescription || 'Not provided'}

Content:
${truncatedContent}

Generate keywords and hint for this skill.`
      }
    ],
    temperature: 0,
    max_tokens: 300
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error('OpenRouter error:', response.status)
      return {
        keywords: [skillName.toLowerCase()],
        hint: skillDescription || `Use /${skillName} skill`,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // Parse JSON from response (handle markdown wrapping)
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleanContent)

    // Validate keywords are all strings
    const validKeywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown): k is string => typeof k === 'string' && (k as string).trim().length > 0)
      : []

    return {
      keywords: validKeywords.length > 0 ? validKeywords : [skillName.toLowerCase()],
      hint: typeof parsed.hint === 'string' ? parsed.hint : (skillDescription || `Use /${skillName} skill`),
    }
  } catch (err) {
    console.error('Failed to generate skill rules:', err)
    return {
      keywords: [skillName.toLowerCase()],
      hint: skillDescription || `Use /${skillName} skill`,
    }
  }
}
