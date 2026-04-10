import { getOperationalDb } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { AGENT_KEY_PATTERN } from '@/lib/prompt-utils'
import { EXCLUDED_SKILLS } from '@/lib/skill-utils'

interface SkillRule {
  isGeneral: boolean
  keywords: string[] // Deprecated: kept for backward compatibility
  primaryKeywords: string[] // High-confidence, trigger alone
  secondaryKeywords: string[] // Need 2+ matches
  hint: string
  description: string
}

function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of keywords) {
    if (typeof raw !== 'string') continue
    const normalized = raw.trim().toLowerCase()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function fallbackPrimaryKeywords(slug: string): string[] {
  const tokens = slug
    .toLowerCase()
    .split(/[-_/]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)

  return normalizeKeywords([slug, ...tokens])
}

// GET: Fetch skill rules for hook matching
export async function GET(req: Request) {
  try {
    // Extract agent key from Authorization header
    const authHeader = req.headers.get('Authorization')
    const agentKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!agentKey || !AGENT_KEY_PATTERN.test(agentKey)) {
      return Response.json({ error: 'Invalid agent key' }, { status: 401 })
    }

    // Rate limiting: 10 requests per minute
    const rateLimitResult = rateLimit(`skill-rules:${agentKey}`, { limit: 10, windowMs: 60 * 1000 })

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

    const db = getOperationalDb()
    const user = await db.users.findByAgentKey(agentKey)

    if (!user || user.status !== 'active') {
      return Response.json({ error: 'Invalid or inactive user' }, { status: 401 })
    }
    const applicableSkills = await db.skills.listActiveForTeam(user.team || '')

    // Build skill-rules.json format
    // Also exclude skills in EXCLUDED_SKILLS list
    const rules: Record<string, SkillRule> = {}

    for (const skill of applicableSkills) {
      // Skip excluded skills
      if (EXCLUDED_SKILLS.includes(skill.slug as typeof EXCLUDED_SKILLS[number])) {
        continue
      }

      const legacyKeywords = normalizeKeywords(skill.keywords ?? [])
      const rawPrimary =
        skill.primary_keywords && skill.primary_keywords.length > 0
          ? skill.primary_keywords
          : skill.keywords ?? []
      const primaryKeywords = normalizeKeywords(rawPrimary)
      const secondaryKeywords = normalizeKeywords(skill.secondary_keywords ?? [])
      const fallbackPrimary = primaryKeywords.length > 0 ? primaryKeywords : fallbackPrimaryKeywords(skill.slug)
      const uniqueSecondary = secondaryKeywords.filter((kw) => !fallbackPrimary.includes(kw))

      rules[skill.slug] = {
        isGeneral: skill.is_general || false,
        keywords: legacyKeywords, // Deprecated but kept for old hooks
        primaryKeywords: fallbackPrimary,
        secondaryKeywords: uniqueSecondary,
        hint: skill.hint || skill.description || `Use /${skill.slug}`,
        description: skill.description || '',
      }
    }

    return Response.json(rules)
  } catch (err) {
    console.error('Skill rules error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
