import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserRow {
  user_id: string
  user_email?: string | null
}

export interface NameResolutionResult {
  userIdToName: Map<string, string>
  userIdToEmail: Map<string, string>
  getDisplayName: (userId: string, email?: string | null) => string
}

/**
 * Resolve user IDs to display names via Supabase (Zeude Identity SSOT).
 *
 * After migration 011, MV user_id = Supabase UUID — direct lookup.
 * Includes email fallback for legacy data without zeude.user.id.
 *
 * Error handling: catches ALL Supabase errors internally.
 * Callers never need their own try/catch around this function.
 * Degradation chain: Supabase name → email → userId → 'Unknown'
 */
export async function resolveUserNames(
  supabase: SupabaseClient,
  rows: UserRow[]
): Promise<NameResolutionResult> {
  const userIdToName = new Map<string, string>()
  const userIdToEmail = new Map<string, string>()

  try {
    // Collect unique non-empty user IDs
    const allUserIds = new Set<string>()
    for (const row of rows) {
      if (row.user_id) allUserIds.add(row.user_id)
    }

    if (allUserIds.size === 0) {
      return { userIdToName, userIdToEmail, getDisplayName: buildGetDisplayName(userIdToName, userIdToEmail) }
    }

    // Direct Supabase lookup — MV user_id is Supabase UUID
    const { data: users } = await supabase
      .from('zeude_users')
      .select('id, name, email')
      .in('id', Array.from(allUserIds))

    if (users) {
      for (const user of users) {
        if (user.name) userIdToName.set(user.id, user.name)
        if (user.email) userIdToEmail.set(user.id, user.email)
      }
    }

    // Email fallback for unresolved users (legacy data without zeude.user.id)
    const unresolvedEmails = new Set<string>()
    for (const row of rows) {
      if (row.user_email && !userIdToName.has(row.user_id)) {
        unresolvedEmails.add(row.user_email)
      }
    }

    if (unresolvedEmails.size > 0) {
      const { data: emailUsers } = await supabase
        .from('zeude_users')
        .select('id, name, email')
        .in('email', Array.from(unresolvedEmails))

      if (emailUsers) {
        const emailToName = new Map<string, string>()
        for (const user of emailUsers) {
          if (user.name && user.email) emailToName.set(user.email, user.name)
        }
        for (const row of rows) {
          if (row.user_email && emailToName.has(row.user_email) && !userIdToName.has(row.user_id)) {
            userIdToName.set(row.user_id, emailToName.get(row.user_email)!)
          }
        }
      }
    }
  } catch (error) {
    console.error('Name resolution failed (continuing with fallback):', error)
  }

  return {
    userIdToName,
    userIdToEmail,
    getDisplayName: buildGetDisplayName(userIdToName, userIdToEmail),
  }
}

function buildGetDisplayName(
  userIdToName: Map<string, string>,
  userIdToEmail: Map<string, string>
): (userId: string, email?: string | null) => string {
  return (userId: string, email?: string | null): string => {
    if (userIdToName.has(userId)) return userIdToName.get(userId)!
    if (email) return email
    return userIdToEmail.get(userId) || userId || 'Unknown'
  }
}
