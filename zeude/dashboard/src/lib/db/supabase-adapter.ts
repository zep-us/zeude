/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createServerClient } from '@/lib/supabase'
import type {
  Agent,
  Hook,
  MCPServer,
  Skill,
  User,
} from '@/lib/database.types'
import type {
  HookInstallStatusRecord,
  McpInstallStatusRecord,
  OperationalDb,
  SessionWithUser,
  UserListOptions,
  UserListResult,
} from './types'

function throwIfError<T extends { error?: unknown }>(result: T) {
  const error = result.error as { code?: string; message?: string } | undefined
  if (error) {
    throw error
  }
}

export function createSupabaseOperationalDb(): OperationalDb {
  const supabase = createServerClient()

  return {
    users: {
      findByAgentKey: () => null,
      findById: (id) => {
        const query = supabase.from('zeude_users').select('id, email, name, team, role, status, invited_by, created_at, updated_at, agent_key, disabled_skills').eq('id', id).single()
        return Promise.resolve(query).then((result: any) => {
          if (result.error) return null
          return result.data as User
        }) as unknown as User | null
      },
      findByEmail: () => null,
      findBasicById: () => null,
      listByIds: () => [],
      listAll: () => {
        const query = supabase.from('zeude_users').select('id, name, email, team, role, status, created_at, updated_at, disabled_skills, invited_by, agent_key').order('team')
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? []) as User[]
        }) as unknown as User[]
      },
      listTeams: () => {
        const query = supabase.from('zeude_users').select('team').order('team')
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return [...new Set((result.data ?? []).map((row: any) => row.team))]
        }) as unknown as string[]
      },
      listUsers: () => ({ users: [], total: 0 }),
      create: (input) => {
        throw new Error(`Not implemented in test adapter: users.create ${JSON.stringify(input)}`)
      },
      updateById: (id, updates) => {
        const query = supabase.from('zeude_users').update(updates).eq('id', id).select('id, email, name, team, role, status').single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as User | null
        }) as unknown as User | null
      },
      updateAgentKey: (id, agentKey) => {
        const query = supabase.from('zeude_users').update({ agent_key: agentKey, updated_at: new Date().toISOString() }).eq('id', id).select('id, email, name, team, role, status, agent_key').single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as User | null
        }) as unknown as User | null
      },
      toggleDisabledSkill: () => [],
    },
    sessions: {
      findValidByTokenWithUser: () => null,
      create: (input) => ({
        id: 'session-id',
        token: input.token,
        user_id: input.user_id,
        expires_at: input.expires_at,
        created_at: new Date().toISOString(),
      }),
      deleteByToken: () => undefined,
    },
    tokens: {
      create: () => undefined,
      findValidByTokenWithUser: () => null,
      deleteById: () => undefined,
    },
    invites: {
      findByToken: () => null,
      create: (input) => {
        const query = supabase.from('zeude_invites').insert(input).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data
        }) as unknown as any
      },
      listRecent: (limit = 50) => {
        const query = supabase
          .from('zeude_invites')
          .select('id, token, team, role, created_by, expires_at, used_at, used_by, created_at')
          .order('created_at', { ascending: false })
          .limit(limit)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data ?? []
        }) as unknown as any[]
      },
      claimByToken: () => null,
      resetClaim: () => undefined,
      markUsedBy: () => undefined,
    },
    skills: {
      listActiveForTeam: () => [],
      listAll: () => {
        const query = supabase.from('zeude_skills').select('*').order('created_at', { ascending: false })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? []) as Skill[]
        }) as unknown as Skill[]
      },
      listBySlugs: (slugs) => {
        const query = supabase.from('zeude_skills').select('slug, description').in('slug', slugs)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data ?? []
        }) as unknown as Pick<Skill, 'slug' | 'description'>[]
      },
      findById: (id) => {
        const query = supabase.from('zeude_skills').select('created_by, contributors').eq('id', id).single()
        return Promise.resolve(query).then((result: any) => {
          if (result.error) return null
          return result.data as Skill
        }) as unknown as Skill | null
      },
      findAccessibleActiveBySlug: () => null,
      create: (input) => {
        const query = supabase.from('zeude_skills').insert(input).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data as Skill
        }) as unknown as Skill
      },
      updateById: (id, updates) => {
        const query = supabase.from('zeude_skills').update(updates).eq('id', id).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as Skill | null
        }) as unknown as Skill | null
      },
      deleteById: (id) => {
        const query = supabase.from('zeude_skills').delete().eq('id', id)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return true
        }) as unknown as boolean
      },
    },
    hooks: {
      listActiveForTeam: () => [],
      listAll: () => {
        const query = supabase.from('zeude_hooks').select('*').order('created_at', { ascending: false })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? []) as Hook[]
        }) as unknown as Hook[]
      },
      findById: () => null,
      create: (input) => {
        const query = supabase.from('zeude_hooks').insert(input).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data as Hook
        }) as unknown as Hook
      },
      updateById: (id, updates) => {
        const query = supabase.from('zeude_hooks').update(updates).eq('id', id).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as Hook | null
        }) as unknown as Hook | null
      },
      deleteById: (id) => {
        const query = supabase.from('zeude_hooks').delete().eq('id', id)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return true
        }) as unknown as boolean
      },
    },
    mcp: {
      listActiveForTeam: () => [],
      listActiveNamesAndIds: () => [],
      listAll: () => {
        const query = supabase.from('zeude_mcp_servers').select('*').order('created_at', { ascending: false })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? []) as MCPServer[]
        }) as unknown as MCPServer[]
      },
      findById: () => null,
      create: (input) => {
        const query = supabase.from('zeude_mcp_servers').insert(input).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data as MCPServer
        }) as unknown as MCPServer
      },
      updateById: (id, updates) => {
        const query = supabase.from('zeude_mcp_servers').update(updates).eq('id', id).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as MCPServer | null
        }) as unknown as MCPServer | null
      },
      deleteById: (id) => {
        const query = supabase.from('zeude_mcp_servers').delete().eq('id', id)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return true
        }) as unknown as boolean
      },
    },
    agents: {
      listActiveForTeam: () => [],
      listAll: () => {
        const query = supabase.from('zeude_agents').select('*').order('created_at', { ascending: false })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? []) as Agent[]
        }) as unknown as Agent[]
      },
      findById: () => null,
      create: (input) => {
        const query = supabase.from('zeude_agents').insert(input).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data as Agent
        }) as unknown as Agent
      },
      updateById: (id, updates) => {
        const query = supabase.from('zeude_agents').update(updates).eq('id', id).select().single()
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return (result.data ?? null) as Agent | null
        }) as unknown as Agent | null
      },
      deleteById: (id) => {
        const query = supabase.from('zeude_agents').delete().eq('id', id)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return true
        }) as unknown as boolean
      },
    },
    installStatus: {
      upsertMcpStatuses: (_statuses: McpInstallStatusRecord[]) => 0,
      upsertHookStatuses: (_statuses: HookInstallStatusRecord[]) => 0,
      listMcpStatuses: () => [],
      listHookStatuses: () => [],
    },
    cohorts: {
      listMembers: (cohortKey) => {
        const query = supabase
          .from('zeude_cohort_members')
          .select('user_id, created_at')
          .eq('cohort_key', cohortKey)
          .order('created_at', { ascending: true })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.data ?? []
        }) as unknown as any[]
      },
      addMembers: (cohortKey, userIds, createdBy) => {
        const rows = userIds.map(userId => ({
          cohort_key: cohortKey,
          user_id: userId,
          created_by: createdBy,
        }))
        const query = supabase
          .from('zeude_cohort_members')
          .upsert(rows, { onConflict: 'cohort_key,user_id', ignoreDuplicates: true, count: 'exact' })
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.count ?? 0
        }) as unknown as number
      },
      countMembers: (cohortKey) => {
        const query = supabase
          .from('zeude_cohort_members')
          .select('id', { count: 'exact', head: true })
          .eq('cohort_key', cohortKey)
        return Promise.resolve(query).then((result: any) => {
          throwIfError(result)
          return result.count ?? 0
        }) as unknown as number
      },
    },
  }
}
