import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { MAX_CONTENT_SIZE, validateFiles } from '@/lib/file-validation'

// PATCH: Update skill (authenticated)
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
      files,
      teams,
      isGlobal,
      status,
      primaryKeywords,
      secondaryKeywords,
      hint,
      contributors,
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

    // Validate files if provided (full replace, so SKILL.md must be present)
    if (files !== undefined) {
      if (typeof files !== 'object' || Array.isArray(files)) {
        return Response.json({ error: 'Files must be an object' }, { status: 400 })
      }

      if (Object.keys(files).length === 0) {
        return Response.json({ error: 'At least one file is required' }, { status: 400 })
      }

      if (!files['SKILL.md'] || typeof files['SKILL.md'] !== 'string') {
        return Response.json({ error: 'Files must include SKILL.md' }, { status: 400 })
      }

      const validation = validateFiles(files)
      if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug
    if (description !== undefined) updateData.description = description
    if (content !== undefined) updateData.content = content
    if (files !== undefined) updateData.files = files
    if (isGlobal !== undefined) {
      updateData.is_global = isGlobal
      if (isGlobal) {
        updateData.teams = []
      } else if (teams === undefined) {
        return Response.json({ error: 'Teams must be specified when disabling global access' }, { status: 400 })
      }
    }
    if (teams !== undefined && !isGlobal) updateData.teams = teams
    if (status !== undefined) updateData.status = status
    if (primaryKeywords !== undefined) updateData.primary_keywords = primaryKeywords
    if (secondaryKeywords !== undefined) updateData.secondary_keywords = secondaryKeywords
    if (hint !== undefined) updateData.hint = hint
    if (contributors !== undefined) {
      if (!Array.isArray(contributors) || !contributors.every((c: unknown) => typeof c === 'string')) {
        return Response.json({ error: 'contributors must be an array of strings' }, { status: 400 })
      }
      updateData.contributors = contributors
    }

    // Auto-add current user as contributor if not explicitly managing contributors
    // Only when: not the creator AND not already a contributor
    if (contributors === undefined) {
      const { data: existing } = await supabase
        .from('zeude_skills')
        .select('created_by, contributors')
        .eq('id', id)
        .single()

      if (existing) {
        const userId = session.user.id
        const existingContributors: string[] = existing.contributors || []
        if (existing.created_by !== userId && !existingContributors.includes(userId)) {
          updateData.contributors = [...existingContributors, userId]
        }
      }
    }

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
      if (error.code === '23514') {
        return Response.json({ error: 'Invalid skill data: check files size (max 512KB total)' }, { status: 400 })
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

// DELETE: Delete skill (authenticated)
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
