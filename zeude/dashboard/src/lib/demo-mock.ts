import type { DailyStats, OverviewStats, SessionSummary } from '@/lib/clickhouse'

export type DemoPeriod = '7d' | '30d' | '90d'

interface DemoLeaderboardUser {
  rank: number
  userName: string
  value: number
  formattedValue: string
}

interface DemoSkillLeaderboardUser {
  rank: number
  userName: string
  skillCount: number
  topSkill: string
}

export interface DemoLeaderboardData {
  topTokenUsers: DemoLeaderboardUser[]
  topEfficiencyUsers: DemoLeaderboardUser[]
  topSkillUsers: DemoSkillLeaderboardUser[]
  skillAdoption: {
    totalUsers: number
    skillUsers: number
    adoptionRate: number
  }
  period: DemoPeriod
  updatedAt: string
}

const BASE_DAY = new Date('2026-02-19T00:00:00Z')

const sessionsToday: SessionSummary[] = [
  {
    session_id: 'mock_fe_9081',
    started_at: '2026-02-19T08:04:00Z',
    ended_at: '2026-02-19T08:41:00Z',
    event_count: 122,
    total_cost: 1.2841,
    input_tokens: 41250,
    output_tokens: 12880,
  },
  {
    session_id: 'mock_platform_3123',
    started_at: '2026-02-19T09:12:00Z',
    ended_at: '2026-02-19T09:58:00Z',
    event_count: 154,
    total_cost: 1.5933,
    input_tokens: 50400,
    output_tokens: 16310,
  },
  {
    session_id: 'mock_data_1140',
    started_at: '2026-02-19T10:22:00Z',
    ended_at: '2026-02-19T10:51:00Z',
    event_count: 89,
    total_cost: 0.8442,
    input_tokens: 28110,
    output_tokens: 9130,
  },
  {
    session_id: 'mock_security_7781',
    started_at: '2026-02-19T11:03:00Z',
    ended_at: '2026-02-19T11:37:00Z',
    event_count: 97,
    total_cost: 0.9725,
    input_tokens: 32450,
    output_tokens: 10120,
  },
  {
    session_id: 'mock_mobile_5508',
    started_at: '2026-02-19T12:11:00Z',
    ended_at: '2026-02-19T12:39:00Z',
    event_count: 76,
    total_cost: 0.6814,
    input_tokens: 22300,
    output_tokens: 7040,
  },
]

export function getDemoSessionsToday(): SessionSummary[] {
  return sessionsToday
}

export function getDemoOverviewStats(): OverviewStats {
  return sessionsToday.reduce(
    (acc, session) => ({
      total_sessions: acc.total_sessions + 1,
      total_cost: acc.total_cost + Number(session.total_cost),
      total_input_tokens: acc.total_input_tokens + Number(session.input_tokens),
      total_output_tokens: acc.total_output_tokens + Number(session.output_tokens),
    }),
    {
      total_sessions: 0,
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
    }
  )
}

export function getDemoDailyStats(days: number = 30): DailyStats[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(BASE_DAY)
    date.setDate(BASE_DAY.getDate() - i)
    const wave = ((i * 11) % 9) * 370

    return {
      date: date.toISOString(),
      sessions: 34 + ((i * 5) % 19),
      cost: Number((8.1 + ((i * 7) % 12) * 0.53).toFixed(4)),
      input_tokens: 112000 + i * 2100 + wave,
      output_tokens: 35600 + i * 860 + wave / 2,
    }
  })
}

const leaderboardByPeriod: Record<DemoPeriod, DemoLeaderboardData> = {
  '7d': {
    topTokenUsers: [
      { rank: 1, userName: 'A. Park', value: 2110000, formattedValue: '2.11M' },
      { rank: 2, userName: 'J. Kim', value: 1890000, formattedValue: '1.89M' },
      { rank: 3, userName: 'S. Lee', value: 1660000, formattedValue: '1.66M' },
      { rank: 4, userName: 'M. Choi', value: 1480000, formattedValue: '1.48M' },
      { rank: 5, userName: 'H. Jung', value: 1290000, formattedValue: '1.29M' },
    ],
    topEfficiencyUsers: [
      { rank: 1, userName: 'S. Lee', value: 92, formattedValue: '92.0' },
      { rank: 2, userName: 'A. Park', value: 88, formattedValue: '88.0' },
      { rank: 3, userName: 'Y. Han', value: 84, formattedValue: '84.0' },
      { rank: 4, userName: 'J. Kim', value: 79, formattedValue: '79.0' },
      { rank: 5, userName: 'D. Lim', value: 74, formattedValue: '74.0' },
    ],
    topSkillUsers: [
      { rank: 1, userName: 'A. Park', skillCount: 74, topSkill: 'refactor-assist' },
      { rank: 2, userName: 'S. Lee', skillCount: 66, topSkill: 'release-notes' },
      { rank: 3, userName: 'J. Kim', skillCount: 61, topSkill: 'prd-helper' },
      { rank: 4, userName: 'M. Choi', skillCount: 55, topSkill: 'db-audit' },
      { rank: 5, userName: 'Y. Han', skillCount: 49, topSkill: 'incident-review' },
    ],
    skillAdoption: {
      totalUsers: 148,
      skillUsers: 46,
      adoptionRate: 31,
    },
    period: '7d',
    updatedAt: '2026-02-19T09:20:00Z',
  },
  '30d': {
    topTokenUsers: [
      { rank: 1, userName: 'A. Park', value: 8120000, formattedValue: '8.12M' },
      { rank: 2, userName: 'J. Kim', value: 7550000, formattedValue: '7.55M' },
      { rank: 3, userName: 'S. Lee', value: 6930000, formattedValue: '6.93M' },
      { rank: 4, userName: 'M. Choi', value: 6480000, formattedValue: '6.48M' },
      { rank: 5, userName: 'H. Jung', value: 5920000, formattedValue: '5.92M' },
    ],
    topEfficiencyUsers: [
      { rank: 1, userName: 'S. Lee', value: 90, formattedValue: '90.0' },
      { rank: 2, userName: 'A. Park', value: 87, formattedValue: '87.0' },
      { rank: 3, userName: 'Y. Han', value: 83, formattedValue: '83.0' },
      { rank: 4, userName: 'D. Lim', value: 80, formattedValue: '80.0' },
      { rank: 5, userName: 'J. Kim', value: 77, formattedValue: '77.0' },
    ],
    topSkillUsers: [
      { rank: 1, userName: 'A. Park', skillCount: 284, topSkill: 'refactor-assist' },
      { rank: 2, userName: 'S. Lee', skillCount: 261, topSkill: 'release-notes' },
      { rank: 3, userName: 'J. Kim', skillCount: 238, topSkill: 'prd-helper' },
      { rank: 4, userName: 'M. Choi', skillCount: 220, topSkill: 'db-audit' },
      { rank: 5, userName: 'Y. Han', skillCount: 201, topSkill: 'incident-review' },
    ],
    skillAdoption: {
      totalUsers: 148,
      skillUsers: 52,
      adoptionRate: 35,
    },
    period: '30d',
    updatedAt: '2026-02-19T09:20:00Z',
  },
  '90d': {
    topTokenUsers: [
      { rank: 1, userName: 'A. Park', value: 24800000, formattedValue: '24.8M' },
      { rank: 2, userName: 'J. Kim', value: 22900000, formattedValue: '22.9M' },
      { rank: 3, userName: 'S. Lee', value: 21400000, formattedValue: '21.4M' },
      { rank: 4, userName: 'M. Choi', value: 19800000, formattedValue: '19.8M' },
      { rank: 5, userName: 'H. Jung', value: 17700000, formattedValue: '17.7M' },
    ],
    topEfficiencyUsers: [
      { rank: 1, userName: 'S. Lee', value: 89, formattedValue: '89.0' },
      { rank: 2, userName: 'A. Park', value: 86, formattedValue: '86.0' },
      { rank: 3, userName: 'D. Lim', value: 82, formattedValue: '82.0' },
      { rank: 4, userName: 'Y. Han', value: 80, formattedValue: '80.0' },
      { rank: 5, userName: 'J. Kim', value: 78, formattedValue: '78.0' },
    ],
    topSkillUsers: [
      { rank: 1, userName: 'A. Park', skillCount: 821, topSkill: 'refactor-assist' },
      { rank: 2, userName: 'S. Lee', skillCount: 770, topSkill: 'release-notes' },
      { rank: 3, userName: 'J. Kim', skillCount: 731, topSkill: 'prd-helper' },
      { rank: 4, userName: 'M. Choi', skillCount: 689, topSkill: 'db-audit' },
      { rank: 5, userName: 'Y. Han', skillCount: 643, topSkill: 'incident-review' },
    ],
    skillAdoption: {
      totalUsers: 148,
      skillUsers: 61,
      adoptionRate: 41,
    },
    period: '90d',
    updatedAt: '2026-02-19T09:20:00Z',
  },
}

export function getDemoLeaderboard(period: DemoPeriod): DemoLeaderboardData {
  return leaderboardByPeriod[period]
}

export interface DemoAdminUser {
  id: string
  name: string
  email: string
  team: string
  role: 'admin' | 'member'
  status: 'active' | 'inactive'
  lastSeen: string
}

export interface DemoAdminSkill {
  id: string
  name: string
  slug: string
  description: string
  teams: string[]
  isGlobal: boolean
  status: 'active' | 'inactive'
  updatedAt: string
}

export interface DemoAdminHook {
  id: string
  name: string
  event: 'UserPromptSubmit' | 'Stop' | 'PreToolUse' | 'PostToolUse' | 'Notification' | 'SubagentStop'
  scriptType: 'bash' | 'python' | 'node'
  teams: string[]
  isGlobal: boolean
  status: 'active' | 'inactive'
  installed: number
  total: number
}

export interface DemoAdminMCP {
  id: string
  name: string
  command: string
  args: string[]
  teams: string[]
  isGlobal: boolean
  status: 'active' | 'inactive'
  installed: number
  total: number
}

const demoAdminUsers: DemoAdminUser[] = [
  {
    id: 'usr_demo_01',
    name: 'A. Park',
    email: 'a.park@zeude.mock',
    team: 'frontend',
    role: 'admin',
    status: 'active',
    lastSeen: '2026-02-19T09:02:00Z',
  },
  {
    id: 'usr_demo_02',
    name: 'J. Kim',
    email: 'j.kim@zeude.mock',
    team: 'platform',
    role: 'member',
    status: 'active',
    lastSeen: '2026-02-19T08:44:00Z',
  },
  {
    id: 'usr_demo_03',
    name: 'S. Lee',
    email: 's.lee@zeude.mock',
    team: 'data',
    role: 'member',
    status: 'active',
    lastSeen: '2026-02-19T08:20:00Z',
  },
  {
    id: 'usr_demo_04',
    name: 'M. Choi',
    email: 'm.choi@zeude.mock',
    team: 'security',
    role: 'member',
    status: 'inactive',
    lastSeen: '2026-02-17T13:11:00Z',
  },
  {
    id: 'usr_demo_05',
    name: 'Y. Han',
    email: 'y.han@zeude.mock',
    team: 'frontend',
    role: 'member',
    status: 'active',
    lastSeen: '2026-02-19T07:57:00Z',
  },
]

const demoAdminSkills: DemoAdminSkill[] = [
  {
    id: 'skill_demo_01',
    name: 'Release Notes Composer',
    slug: 'release-notes',
    description: 'Draft structured release notes from merged PRs.',
    teams: ['platform', 'frontend'],
    isGlobal: false,
    status: 'active',
    updatedAt: '2026-02-18T12:10:00Z',
  },
  {
    id: 'skill_demo_02',
    name: 'Incident Reviewer',
    slug: 'incident-review',
    description: 'Summarize incident timeline and propose follow-ups.',
    teams: ['security', 'platform'],
    isGlobal: false,
    status: 'active',
    updatedAt: '2026-02-17T08:40:00Z',
  },
  {
    id: 'skill_demo_03',
    name: 'Refactor Assist',
    slug: 'refactor-assist',
    description: 'Generate staged refactor plans for legacy modules.',
    teams: [],
    isGlobal: true,
    status: 'active',
    updatedAt: '2026-02-16T16:22:00Z',
  },
  {
    id: 'skill_demo_04',
    name: 'PRD Draft Helper',
    slug: 'prd-helper',
    description: 'Convert product briefs into implementation-ready PRDs.',
    teams: ['product'],
    isGlobal: false,
    status: 'inactive',
    updatedAt: '2026-02-11T11:09:00Z',
  },
]

const demoAdminHooks: DemoAdminHook[] = [
  {
    id: 'hook_demo_01',
    name: 'Prompt Logger',
    event: 'UserPromptSubmit',
    scriptType: 'node',
    teams: [],
    isGlobal: true,
    status: 'active',
    installed: 136,
    total: 148,
  },
  {
    id: 'hook_demo_02',
    name: 'PII Guard',
    event: 'PreToolUse',
    scriptType: 'python',
    teams: ['security'],
    isGlobal: false,
    status: 'active',
    installed: 23,
    total: 27,
  },
  {
    id: 'hook_demo_03',
    name: 'Session Summary',
    event: 'Stop',
    scriptType: 'bash',
    teams: ['frontend', 'platform'],
    isGlobal: false,
    status: 'inactive',
    installed: 0,
    total: 79,
  },
]

const demoAdminMCPServers: DemoAdminMCP[] = [
  {
    id: 'mcp_demo_01',
    name: 'GitHub Enterprise',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    teams: [],
    isGlobal: true,
    status: 'active',
    installed: 140,
    total: 148,
  },
  {
    id: 'mcp_demo_02',
    name: 'Jira Cloud',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-jira'],
    teams: ['platform', 'product'],
    isGlobal: false,
    status: 'active',
    installed: 61,
    total: 72,
  },
  {
    id: 'mcp_demo_03',
    name: 'Internal Docs',
    command: 'uvx',
    args: ['mcp-docs-server'],
    teams: ['frontend', 'data'],
    isGlobal: false,
    status: 'inactive',
    installed: 0,
    total: 64,
  },
]

export function getDemoAdminUsers(): DemoAdminUser[] {
  return demoAdminUsers
}

export function getDemoAdminUserById(id: string): DemoAdminUser | undefined {
  return demoAdminUsers.find((user) => user.id === id)
}

export function getDemoAdminSkills(): DemoAdminSkill[] {
  return demoAdminSkills
}

export function getDemoAdminSkillById(id: string): DemoAdminSkill | undefined {
  return demoAdminSkills.find((skill) => skill.id === id)
}

export function getDemoAdminHooks(): DemoAdminHook[] {
  return demoAdminHooks
}

export function getDemoAdminHookById(id: string): DemoAdminHook | undefined {
  return demoAdminHooks.find((hook) => hook.id === id)
}

export function getDemoAdminMCPServers(): DemoAdminMCP[] {
  return demoAdminMCPServers
}

export function getDemoAdminMCPServerById(id: string): DemoAdminMCP | undefined {
  return demoAdminMCPServers.find((server) => server.id === id)
}
