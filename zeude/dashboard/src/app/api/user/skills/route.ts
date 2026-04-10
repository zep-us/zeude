import { getSession } from '@/lib/session'
import { getOperationalDb } from '@/lib/db'

// GET: List all available skills with user's disable status
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const db = getOperationalDb()
    const user = session.user

    // Fetch skills available to this user's team
    const skills = db.skills.listActiveForTeam(user.team).sort((a, b) => a.name.localeCompare(b.name))
    const currentUser = db.users.findById(user.id)
    const disabledSkills: string[] = currentUser?.disabled_skills || []

    const skillsWithStatus = skills.map(skill => ({
      ...skill,
      disabled: disabledSkills.includes(skill.slug),
    }))

    return Response.json({
      skills: skillsWithStatus,
      disabledCount: disabledSkills.length,
      totalCount: skills.length,
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

    const db = getOperationalDb()
    const userId = session.user.id

    // Verify the slug exists as an active skill accessible to this user
    const skillExists = db.skills.findAccessibleActiveBySlug(session.user.team, slug)

    if (!skillExists) {
      return Response.json({ error: 'Skill not found or not accessible' }, { status: 404 })
    }

    const disabledSkills = db.users.toggleDisabledSkill(userId, slug, disabled)

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
