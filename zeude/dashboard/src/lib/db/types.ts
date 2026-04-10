import type {
  Agent,
  Hook,
  Invite,
  MCPServer,
  Session,
  Skill,
  User,
} from '@/lib/database.types'

export interface SessionWithUser extends Session {
  user: User
}

export interface UserListOptions {
  team?: string | null
  status?: string | null
  search?: string | null
  page?: number
  limit?: number
}

export interface UserListResult {
  users: Pick<User, 'id' | 'email' | 'name' | 'team' | 'role' | 'status' | 'created_at' | 'updated_at'>[]
  total: number
}

export interface McpInstallStatusRecord {
  user_id: string
  mcp_server_id: string
  installed: boolean
  version: string | null
  last_checked_at: string
}

export interface HookInstallStatusRecord {
  user_id: string
  hook_id: string
  installed: boolean
  version: string | null
  last_checked_at: string
}

export interface CohortMemberRecord {
  user_id: string
  created_at: string
}

export interface UsersRepository {
  findByAgentKey(agentKey: string): User | null
  findById(id: string): User | null
  findByEmail(email: string): User | null
  findBasicById(id: string): Pick<User, 'id' | 'email' | 'name'> | null
  listByIds(ids: string[]): Pick<User, 'id' | 'email' | 'name'>[]
  listAll(): User[]
  listTeams(): string[]
  listUsers(options: UserListOptions): UserListResult
  create(input: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }): User
  updateById(id: string, updates: Partial<Omit<User, 'id' | 'created_at'>>): User | null
  updateAgentKey(id: string, agentKey: string): User | null
  toggleDisabledSkill(userId: string, slug: string, disabled: boolean): string[]
}

export interface SessionsRepository {
  findValidByTokenWithUser(token: string, nowIso: string): SessionWithUser | null
  create(input: { token: string; user_id: string; expires_at: string }): Session
  deleteByToken(token: string): void
}

export interface TokensRepository {
  create(input: { token: string; user_id: string; expires_at: string }): void
  findValidByTokenWithUser(token: string, nowIso: string): SessionWithUser | null
  deleteById(id: string): void
}

export interface InvitesRepository {
  findByToken(token: string): Invite | null
  create(input: Omit<Invite, 'id' | 'created_at'> & { id?: string; created_at?: string }): Invite
  listRecent(limit?: number): Invite[]
  claimByToken(token: string, usedAt: string): Invite | null
  resetClaim(id: string): void
  markUsedBy(id: string, userId: string): void
}

export interface SkillsRepository {
  listActiveForTeam(team: string): Skill[]
  listAll(): Skill[]
  listBySlugs(slugs: string[]): Pick<Skill, 'slug' | 'description'>[]
  findById(id: string): Skill | null
  findAccessibleActiveBySlug(team: string, slug: string): Pick<Skill, 'id' | 'slug'> | null
  create(input: Omit<Skill, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }): Skill
  updateById(id: string, updates: Partial<Omit<Skill, 'id' | 'created_at'>>): Skill | null
  deleteById(id: string): boolean
}

export interface HooksRepository {
  listActiveForTeam(team: string): Hook[]
  listAll(): Hook[]
  findById(id: string): Hook | null
  create(input: Omit<Hook, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }): Hook
  updateById(id: string, updates: Partial<Omit<Hook, 'id' | 'created_at'>>): Hook | null
  deleteById(id: string): boolean
}

export interface McpRepository {
  listActiveForTeam(team: string): MCPServer[]
  listActiveNamesAndIds(): Pick<MCPServer, 'id' | 'name'>[]
  listAll(): MCPServer[]
  findById(id: string): MCPServer | null
  create(input: Omit<MCPServer, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }): MCPServer
  updateById(id: string, updates: Partial<Omit<MCPServer, 'id' | 'created_at'>>): MCPServer | null
  deleteById(id: string): boolean
}

export interface AgentsRepository {
  listActiveForTeam(team: string): Agent[]
  listAll(): Agent[]
  findById(id: string): Agent | null
  create(input: Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }): Agent
  updateById(id: string, updates: Partial<Omit<Agent, 'id' | 'created_at'>>): Agent | null
  deleteById(id: string): boolean
}

export interface InstallStatusRepository {
  upsertMcpStatuses(statuses: McpInstallStatusRecord[]): number
  upsertHookStatuses(statuses: HookInstallStatusRecord[]): number
  listMcpStatuses(): McpInstallStatusRecord[]
  listHookStatuses(): HookInstallStatusRecord[]
}

export interface CohortsRepository {
  listMembers(cohortKey: string): CohortMemberRecord[]
  addMembers(cohortKey: string, userIds: string[], createdBy: string): number
  countMembers(cohortKey: string): number
}

export interface OperationalDb {
  users: UsersRepository
  sessions: SessionsRepository
  tokens: TokensRepository
  invites: InvitesRepository
  skills: SkillsRepository
  hooks: HooksRepository
  mcp: McpRepository
  agents: AgentsRepository
  installStatus: InstallStatusRepository
  cohorts: CohortsRepository
}
