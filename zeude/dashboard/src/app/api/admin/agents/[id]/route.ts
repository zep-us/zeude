import { getSession } from '@/lib/session'
import { validateFiles } from '@/lib/file-validation'
import { getOperationalDb } from '@/lib/db'

// Agent name validation: lowercase letters and hyphens only (kebab-case, no digits)
const AGENT_NAME_PATTERN = /^[a-z]+(-[a-z]+)*$/
const MAX_NAME_LENGTH = 64

// PATCH: Update agent
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
    const { name, description, files, teams, isGlobal, status } = body

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length === 0) {
        return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
      }
      if (name.length > MAX_NAME_LENGTH) {
        return Response.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or less` }, { status: 400 })
      }
      if (!AGENT_NAME_PATTERN.test(name)) {
        return Response.json({
          error: 'Name must be kebab-case (lowercase letters and hyphens only). Example: code-critic'
        }, { status: 400 })
      }
    }

    // Validate files if provided
    if (files !== undefined) {
      if (typeof files !== 'object' || Array.isArray(files)) {
        return Response.json({ error: 'Files must be an object' }, { status: 400 })
      }

      if (Object.keys(files).length === 0) {
        return Response.json({ error: 'At least one file is required' }, { status: 400 })
      }

      const validation = validateFiles(files)
      if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 400 })
      }
    }

    const db = getOperationalDb()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
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

    let agent
    try {
      agent = await db.agents.updateById(id, updateData)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return Response.json({ error: 'An agent with this name already exists' }, { status: 400 })
      }
      if (code === '23514' || code === 'SQLITE_CONSTRAINT_CHECK') {
        return Response.json({ error: 'Invalid agent data: check name format and files size' }, { status: 400 })
      }
      console.error('Failed to update agent:', error)
      return Response.json({ error: 'Failed to update agent' }, { status: 500 })
    }
    if (!agent) {
      return Response.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    return Response.json({ agent })
  } catch (err) {
    console.error('Agent update error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete agent
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
    const db = getOperationalDb()
    const deleted = await db.agents.deleteById(id)
    if (!deleted) {
      return Response.json({ error: 'Failed to delete agent' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('Agent delete error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
