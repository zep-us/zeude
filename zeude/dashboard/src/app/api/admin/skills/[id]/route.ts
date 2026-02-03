import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Maximum content size: 100KB
const MAX_CONTENT_SIZE = 100 * 1024

// PATCH: Update skill
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const {
      name,
      slug,
      description,
      content,
      teams,
      isGlobal,
      status,
      primaryKeywords,
      secondaryKeywords,
      hint,
    } = body

    // Validate slug format if provided
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: 'Slug must be kebab-case (e.g., my-skill-name)' }, { status: 400 })
    }

    // Validate content size if provided
    if (content && typeof content === 'string' && content.length > MAX_CONTENT_SIZE) {
      return Response.json({
        error: `Content too large. Maximum size is ${MAX_CONTENT_SIZE / 1024}KB`
      }, { status: 400 })
    }

    const supabase = createServerClient()

    // Validate keyword arrays if provided
    if (primaryKeywords !== undefined) {
      if (!Array.isArray(primaryKeywords) || !primaryKeywords.every((k) => typeof k === 'string')) {
        return Response.json({ error: 'primaryKeywords must be an array of strings' }, { status: 400 })
      }
    }
    if (secondaryKeywords !== undefined) {
      if (
        !Array.isArray(secondaryKeywords) ||
        !secondaryKeywords.every((k) => typeof k === 'string')
      ) {
        return Response.json(
          { error: 'secondaryKeywords must be an array of strings' },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug
    if (description !== undefined) updateData.description = description
    if (content !== undefined) updateData.content = content
    if (teams !== undefined) updateData.teams = teams
    if (isGlobal !== undefined) updateData.is_global = isGlobal
    if (status !== undefined) updateData.status = status
    if (primaryKeywords !== undefined) updateData.primary_keywords = primaryKeywords
    if (secondaryKeywords !== undefined) updateData.secondary_keywords = secondaryKeywords
    if (hint !== undefined) updateData.hint = hint

    const { data: skill, error } = await supabase
      .from('zeude_skills')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'A skill with this slug already exists' }, { status: 400 })
      }
      console.error('Failed to update skill:', error)
      return Response.json({ error: 'Failed to update skill' }, { status: 500 })
    }

    return Response.json({ skill })
  } catch (err) {
    console.error('Skill update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete skill
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('zeude_skills')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete skill:', error)
      return Response.json({ error: 'Failed to delete skill' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('Skill delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
