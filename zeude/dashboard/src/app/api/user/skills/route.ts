import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// GET: List all available skills with user's disable status
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createServerClient()
    const user = session.user

    // Fetch skills available to this user's team
    const { data: skills, error: skillsError } = await supabase
      .from('zeude_skills')
      .select('id, name, slug, description, is_global, teams, status')
      .eq('status', 'active')
      .or(`is_global.eq.true,teams.cs.{"${user.team}"}`)
      .order('name')

    if (skillsError) {
      console.error('Failed to fetch skills:', skillsError)
      return Response.json({ error: 'Failed to fetch skills' }, { status: 500 })
    }

    // Get user's disabled skills
    const { data: userData, error: userError } = await supabase
      .from('zeude_users')
      .select('disabled_skills')
      .eq('id', user.id)
      .single()

    if (userError) {
      console.error('Failed to fetch user preferences:', userError)
      return Response.json({ error: 'Failed to fetch preferences' }, { status: 500 })
    }

    const disabledSkills: string[] = userData?.disabled_skills || []

    const skillsWithStatus = (skills || []).map(skill => ({
      ...skill,
      disabled: disabledSkills.includes(skill.slug),
    }))

    return Response.json({
      skills: skillsWithStatus,
      disabledCount: disabledSkills.length,
      totalCount: skills?.length || 0,
    })
  } catch (err) {
    console.error('User skills fetch error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Toggle a skill's disabled status for the current user
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { slug, disabled } = body

    if (!slug || typeof slug !== 'string') {
      return Response.json({ error: 'Skill slug is required' }, { status: 400 })
    }

    if (typeof disabled !== 'boolean') {
      return Response.json({ error: 'disabled must be a boolean' }, { status: 400 })
    }

    // Validate slug format (prevent injection)
    if (!/^[a-z0-9_-]+(?::[a-z0-9_-]+)*$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const supabase = createServerClient()
    const userId = session.user.id

    // Verify the slug exists as an active skill accessible to this user
    const { data: skillExists, error: skillCheckError } = await supabase
      .from('zeude_skills')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'active')
      .or(`is_global.eq.true,teams.cs.{"${session.user.team}"}`)
      .limit(1)
      .single()

    if (skillCheckError || !skillExists) {
      return Response.json({ error: 'Skill not found or not accessible' }, { status: 404 })
    }

    // Atomic toggle using PostgreSQL function (avoids read-then-write race condition)
    const { data: disabledSkills, error: rpcError } = await supabase
      .rpc('toggle_disabled_skill', {
        p_user_id: userId,
        p_slug: slug,
        p_disabled: disabled,
      })

    if (rpcError) {
      console.error('Failed to toggle disabled skill:', rpcError)
      return Response.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    return Response.json({
      slug,
      disabled,
      disabledSkills: disabledSkills || [],
    })
  } catch (err) {
    console.error('User skill preference update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
