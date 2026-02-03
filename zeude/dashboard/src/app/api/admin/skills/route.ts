import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { hasAllowedTools, generateSkillRules } from '@/lib/skill-utils'

// Maximum content size: 100KB
const MAX_CONTENT_SIZE = 100 * 1024

// GET: List all Skills
export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const supabase = createServerClient()

    const { data: skills, error } = await supabase
      .from('zeude_skills')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch skills:', error)
      return Response.json({ error: 'Failed to fetch skills' }, { status: 500 })
    }

    // Get unique teams for filter dropdown
    const { data: usersData } = await supabase
      .from('zeude_users')
      .select('team')
      .order('team')

    const teams = [...new Set(usersData?.map(u => u.team) || [])]

    return Response.json({ skills, teams })
  } catch (err) {
    console.error('Skills list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new Skill
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { name, slug, description, content, teams = [], isGlobal = false, isGeneral = false } = body

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!slug || typeof slug !== 'string') {
      return Response.json({ error: 'Slug is required' }, { status: 400 })
    }

    // Validate slug format (kebab-case)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: 'Slug must be kebab-case (e.g., my-skill-name)' }, { status: 400 })
    }

    if (!content || typeof content !== 'string') {
      return Response.json({ error: 'Content is required' }, { status: 400 })
    }

    // Validate content size to prevent DoS
    if (content.length > MAX_CONTENT_SIZE) {
      return Response.json({
        error: `Content too large. Maximum size is ${MAX_CONTENT_SIZE / 1024}KB`
      }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check if this is a command (has allowed-tools) - skip LLM generation
    const isCommand = hasAllowedTools(content)

    // Initial insert
    const { data: skill, error } = await supabase
      .from('zeude_skills')
      .insert({
        name,
        slug,
        description: description || null,
        content,
        teams: isGlobal ? [] : teams,
        is_global: isGlobal,
        is_general: isGeneral,
        is_command: isCommand,
        status: 'active',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'A skill with this slug already exists' }, { status: 400 })
      }
      console.error('Failed to create skill:', error)
      return Response.json({ error: 'Failed to create skill' }, { status: 500 })
    }

    // Generate keywords and hint using LLM (only for non-command skills)
    let updatedSkill = skill
    if (!isCommand) {
      try {
        const rules = await generateSkillRules(name, description, content)

        // Update skill with generated rules
        await supabase
          .from('zeude_skills')
          .update({
            keywords: rules.keywords,
            hint: rules.hint,
          })
          .eq('id', skill.id)

        // Create new object instead of mutating DB response
        updatedSkill = { ...skill, keywords: rules.keywords, hint: rules.hint }
      } catch (err) {
        console.error('Failed to generate skill rules:', err)
        // Non-fatal: skill is created, just without auto-generated rules
      }
    }

    return Response.json({ skill: updatedSkill })
  } catch (err) {
    console.error('Skill create error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
