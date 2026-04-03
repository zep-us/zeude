/**
 * Backfill script: Generate keywords and hints for existing skills
 * Run with: npx tsx scripts/backfill-skill-rules.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Check if skill has allowed-tools (making it a command)
function hasAllowedTools(content: string): boolean {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return false
  const frontmatter = frontmatterMatch[1]
  return /allowed[-_]tools\s*:/i.test(frontmatter)
}

// Generate keywords and hint using LLM
async function generateSkillRules(
  skillName: string,
  skillDescription: string | null,
  skillContent: string
): Promise<{ keywords: string[]; hint: string }> {
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://localhost:3000',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleanContent)

  const validKeywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k: unknown): k is string => typeof k === 'string' && (k as string).trim().length > 0)
    : []

  return {
    keywords: validKeywords.length > 0 ? validKeywords : [skillName.toLowerCase()],
    hint: typeof parsed.hint === 'string' ? parsed.hint : (skillDescription || `Use /${skillName} skill`),
  }
}

async function main() {
  console.log('Fetching skills...')

  // Fetch all skills
  const { data: skills, error } = await supabase
    .from('zeude_skills')
    .select('id, name, slug, description, content, keywords, hint, is_command')
    .eq('status', 'active')

  if (error) {
    console.error('Failed to fetch skills:', error)
    process.exit(1)
  }

  console.log(`Found ${skills.length} skills`)

  for (const skill of skills) {
    // Check if it's a command
    const isCommand = hasAllowedTools(skill.content)

    // Update is_command flag if needed
    if (skill.is_command !== isCommand) {
      console.log(`[${skill.slug}] Updating is_command: ${isCommand}`)
      await supabase
        .from('zeude_skills')
        .update({ is_command: isCommand })
        .eq('id', skill.id)
    }

    // Skip commands for keyword generation
    if (isCommand) {
      console.log(`[${skill.slug}] Skipping (command)`)
      continue
    }

    // Force regenerate all keywords with improved prompt
    // Previously: skip if already has keywords
    // Now: always regenerate to get better, broader keywords

    // Generate keywords and hint
    console.log(`[${skill.slug}] Generating keywords and hint...`)
    try {
      const rules = await generateSkillRules(skill.name, skill.description, skill.content)

      console.log(`  Keywords: ${rules.keywords.join(', ')}`)
      console.log(`  Hint: ${rules.hint.slice(0, 80)}...`)

      // Update skill
      const { error: updateError } = await supabase
        .from('zeude_skills')
        .update({
          keywords: rules.keywords,
          hint: rules.hint,
        })
        .eq('id', skill.id)

      if (updateError) {
        console.error(`  Failed to update: ${updateError.message}`)
      } else {
        console.log(`  Updated successfully`)
      }

      // Rate limit: wait 1 second between LLM calls
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (err) {
      console.error(`  Error: ${err}`)
    }
  }

  console.log('Done!')
}

main()
