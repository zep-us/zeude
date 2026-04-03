import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { validateFiles } from '@/lib/file-validation'

// Agent name validation: lowercase letters and hyphens only (kebab-case, no digits)
const AGENT_NAME_PATTERN = /^[a-z]+(-[a-z]+)*$/
const MAX_NAME_LENGTH = 64

// GET: List all Agents
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

    const { data: agents, error } = await supabase
      .from('zeude_agents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch agents:', error)
      return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    // Get unique teams for filter dropdown
    const { data: usersData } = await supabase
      .from('zeude_users')
      .select('team')
      .order('team')

    const teams = [...new Set(usersData?.map(u => u.team) || [])]

    return Response.json({ agents, teams })
  } catch (err) {
    console.error('Agents list error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new Agent
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
    const { name, description, files, teams = [], isGlobal = false } = body

    // Validate name
    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (name.length > MAX_NAME_LENGTH) {
      return Response.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or less` }, { status: 400 })
    }

    if (!AGENT_NAME_PATTERN.test(name)) {
      return Response.json({
        error: 'Name must be kebab-case (lowercase letters and hyphens only). Example: code-critic'
      }, { status: 400 })
    }

    // Validate files
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return Response.json({ error: 'Files object is required' }, { status: 400 })
    }

    if (Object.keys(files).length === 0) {
      return Response.json({ error: 'At least one file is required' }, { status: 400 })
    }

    // Validate each file path and content
    const validation = validateFiles(files)
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: agent, error } = await supabase
      .from('zeude_agents')
      .insert({
        name,
        description: description || null,
        files,
        teams: isGlobal ? [] : teams,
        is_global: isGlobal,
        status: 'active',
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'An agent with this name already exists' }, { status: 400 })
      }
      if (error.code === '23514') {
        // CHECK constraint violation (name format or files size)
        return Response.json({ error: 'Invalid agent data: check name format and files size' }, { status: 400 })
      }
      console.error('Failed to create agent:', error)
      return Response.json({ error: 'Failed to create agent' }, { status: 500 })
    }

    return Response.json({ agent })
  } catch (err) {
    console.error('Agent create error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
