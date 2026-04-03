import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { hasAllowedTools } from '@/lib/skill-utils'
import { validateFiles } from '@/lib/file-validation'
import { fetchSkillsData } from '@/lib/data/admin-skills'

// GET: List all Skills (authenticated)
export async function GET() {
  try {
    const data = await fetchSkillsData()
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return Response.json({ error: message }, { status: 401 })
    }
    if (message === 'Admin access required') {
      return Response.json({ error: message }, { status: 403 })
    }
    console.error('Skills list error:', err)
    return Response.json({ error: 'Failed to fetch skills' }, { status: 500 })
  }
}

// POST: Create new Skill (authenticated)
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const {
      name, slug, description, files,
      teams = [], isGlobal = false, isGeneral = false,
      primaryKeywords, secondaryKeywords, hint,
      contributors,
    } = body

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

    // New skills: files is the source of truth, content is not used
    if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) {
      return Response.json({ error: 'Files is required (must include at least SKILL.md)' }, { status: 400 })
    }

    if (!files['SKILL.md'] || typeof files['SKILL.md'] !== 'string') {
      return Response.json({ error: 'Files must include SKILL.md' }, { status: 400 })
    }

    // Validate each file path and content (same as agents — proposal §3.2)
    const validation = validateFiles(files)
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check if this is a command (has allowed-tools) - skip LLM generation
    const isCommand = hasAllowedTools(files['SKILL.md'])

    // New skills: content = NULL (old shim gracefully skips, new shim uses files)
    const { data: skill, error } = await supabase
      .from('zeude_skills')
      .insert({
        name,
        slug,
        description: description || null,
        content: null,
        files,
        teams: isGlobal ? [] : teams,
        is_global: isGlobal,
        is_general: isGeneral,
        is_command: isCommand,
        primary_keywords: primaryKeywords || [],
        secondary_keywords: secondaryKeywords || [],
        hint: hint || '',
        contributors: Array.isArray(contributors) ? contributors : [],
        status: 'active',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'A skill with this slug already exists' }, { status: 400 })
      }
      if (error.code === '23514') {
        return Response.json({ error: 'Invalid skill data: check files size (max 5MB total)' }, { status: 400 })
      }
      console.error('Failed to create skill:', error)
      return Response.json({ error: 'Failed to create skill' }, { status: 500 })
    }

    return Response.json({ skill })
  } catch (err) {
    console.error('Skill create error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
