// Mock data for local testing without DB
// This file is NOT committed - just for local dev testing

const mockUsers = [
  { userId: 'u1', userName: 'Alice Kim', team: 'backend', email: 'alice@example.com', role: 'admin', status: 'active' },
  { userId: 'u2', userName: 'Bob Lee', team: 'frontend', email: 'bob@example.com', role: 'member', status: 'active' },
  { userId: 'u3', userName: 'Charlie Park', team: 'backend', email: 'charlie@example.com', role: 'member', status: 'active' },
  { userId: 'u4', userName: 'Diana Choi', team: 'frontend', email: 'diana@example.com', role: 'member', status: 'active' },
  { userId: 'u5', userName: 'Ethan Jung', team: 'devops', email: 'ethan@example.com', role: 'member', status: 'active' },
  { userId: 'u6', userName: 'Fiona Kang', team: 'backend', email: 'fiona@example.com', role: 'member', status: 'active' },
  { userId: 'u7', userName: 'George Han', team: 'frontend', email: 'george@example.com', role: 'member', status: 'inactive' },
  { userId: 'u8', userName: 'Helen Yoon', team: 'devops', email: 'helen@example.com', role: 'admin', status: 'active' },
  { userId: 'u9', userName: 'Ivan Lim', team: 'backend', email: 'ivan@example.com', role: 'member', status: 'active' },
  { userId: 'u10', userName: 'Julia Shin', team: 'frontend', email: 'julia@example.com', role: 'member', status: 'active' },
]

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function mockLeaderboard() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1)
  monday.setHours(8, 0, 0, 0)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  const prevMonday = new Date(monday)
  prevMonday.setDate(monday.getDate() - 7)

  return {
    topTokenUsers: mockUsers.slice(0, 8).map((u, i) => ({
      rank: i + 1,
      userName: u.userName,
      userId: u.userId,
      value: randomInt(500000, 5000000) - i * 400000,
      formattedValue: `${((randomInt(500000, 5000000) - i * 400000) / 1000000).toFixed(1)}M`,
    })),
    previousTopTokenUsers: mockUsers.slice(0, 6).map((u, i) => ({
      rank: i + 1,
      userName: u.userName,
      userId: u.userId,
      value: randomInt(300000, 3000000) - i * 300000,
      formattedValue: `${((randomInt(300000, 3000000) - i * 300000) / 1000000).toFixed(1)}M`,
    })),
    topSkills: [
      { rank: 1, skillName: 'commit', description: 'Generate conventional commits', usageCount: 342, userCount: 8, topUsers: ['Alice Kim', 'Bob Lee'], formattedValue: '342 calls' },
      { rank: 2, skillName: 'review-pr', description: 'Review pull requests', usageCount: 218, userCount: 6, topUsers: ['Charlie Park', 'Diana Choi'], formattedValue: '218 calls' },
      { rank: 3, skillName: 'test', description: 'Generate test cases', usageCount: 156, userCount: 5, topUsers: ['Ethan Jung'], formattedValue: '156 calls' },
      { rank: 4, skillName: 'refactor', description: 'Refactor code', usageCount: 89, userCount: 4, topUsers: ['Fiona Kang'], formattedValue: '89 calls' },
      { rank: 5, skillName: 'debug', description: 'Debug issues', usageCount: 67, userCount: 3, topUsers: ['Ivan Lim'], formattedValue: '67 calls' },
    ],
    weekWindow: {
      currentStart: monday.toISOString(),
      currentEnd: nextMonday.toISOString(),
      previousStart: prevMonday.toISOString(),
      previousEnd: monday.toISOString(),
      nextReset: nextMonday.toISOString(),
      timezone: 'Asia/Seoul' as const,
    },
    updatedAt: now.toISOString(),
  }
}

export function mockAnalyticsUsage() {
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - 29 + i)
    return {
      date: date.toISOString().split('T')[0],
      inputTokens: randomInt(100000, 800000),
      outputTokens: randomInt(50000, 400000),
      cost: randomInt(5, 50) + Math.random(),
    }
  })

  return {
    summary: {
      totalInputTokens: 12500000,
      totalOutputTokens: 6200000,
      totalCost: 284.50,
      cacheHitRate: 0.82,
      totalRequests: 4320,
    },
    trend,
    sourceBreakdown: [
      { source: 'claude', inputTokens: 9800000, outputTokens: 4900000, cost: 220.30, requestCount: 3400, cacheReadTokens: 8000000 },
      { source: 'codex', inputTokens: 2700000, outputTokens: 1300000, cost: 64.20, requestCount: 920, cacheReadTokens: 2100000 },
    ],
    trendBySource: trend.map(t => ({
      ...t,
      source: 'claude',
      inputTokensClaude: t.inputTokens * 0.78,
      outputTokensClaude: t.outputTokens * 0.78,
      costClaude: t.cost * 0.78,
      inputTokensCodex: t.inputTokens * 0.22,
      outputTokensCodex: t.outputTokens * 0.22,
      costCodex: t.cost * 0.22,
    })),
    byUserBySource: [],
    byUser: mockUsers.slice(0, 10).map((u, i) => ({
      userId: u.userId,
      userName: u.userName,
      team: u.team,
      inputTokens: randomInt(500000, 2000000) - i * 100000,
      outputTokens: randomInt(200000, 1000000) - i * 50000,
      cacheReadTokens: randomInt(400000, 1600000),
      cost: randomInt(10, 80) + Math.random(),
      cacheHitRate: 0.7 + Math.random() * 0.25,
      requestCount: randomInt(100, 800),
    })),
    pagination: {
      page: 1,
      pageSize: 50,
      totalUsers: 10,
      totalPages: 1,
      search: '',
    },
  }
}

export function mockEfficiency() {
  return {
    byUser: mockUsers.slice(0, 10).map((u) => ({
      userId: u.userId,
      userName: u.userName,
      cacheHitRate: 0.65 + Math.random() * 0.3,
      avgInputPerRequest: randomInt(1000, 5000),
      contextGrowthRate: Math.random() * 2,
      retryDensity: Math.random() * 0.3,
      efficiencyScore: randomInt(40, 95),
      costEfficiency: randomInt(50, 95),
      workQuality: randomInt(60, 98),
      contextEfficiency: randomInt(45, 90),
      tips: ['Use more specific prompts', 'Leverage context caching'],
    })),
  }
}

export function mockSkillsAnalytics() {
  return {
    promptTypeStats: [
      { prompt_type: 'code_generation', count: 1240, percentage: 45 },
      { prompt_type: 'code_review', count: 680, percentage: 25 },
      { prompt_type: 'debugging', count: 420, percentage: 15 },
      { prompt_type: 'documentation', count: 280, percentage: 10 },
      { prompt_type: 'other', count: 140, percentage: 5 },
    ],
    topSkills: [
      { invoked_name: 'commit', count: 342, last_used: new Date().toISOString() },
      { invoked_name: 'review-pr', count: 218, last_used: new Date().toISOString() },
      { invoked_name: 'test', count: 156, last_used: new Date().toISOString() },
    ],
    adoptionRate: { total_users: 10, skill_users: 8, adoption_rate: 80 },
  }
}

export function mockHooks() {
  return {
    hooks: [
      { id: 'h1', name: 'Prompt Logger', event: 'UserPromptSubmit', description: 'Logs all user prompts', script_content: '#!/bin/bash\necho "logged"', script_type: 'bash', env: {}, teams: ['backend', 'frontend'], is_global: false, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'h2', name: 'Cost Alert', event: 'Stop', description: 'Alert when session cost exceeds threshold', script_content: '#!/bin/bash\necho "alert"', script_type: 'bash', env: {}, teams: [], is_global: true, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'h3', name: 'Auto Format', event: 'PostToolUse', description: 'Run formatter after file edits', script_content: '#!/bin/bash\nnpx prettier --write "$FILE"', script_type: 'bash', env: {}, teams: ['frontend'], is_global: false, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    teams: ['backend', 'frontend', 'devops'],
    installStatus: {
      h1: { installed: 6, total: 8, details: mockUsers.slice(0, 8).map(u => ({ userId: u.userId, userName: u.userName, installed: Math.random() > 0.3, version: '1.0.0', lastCheckedAt: new Date().toISOString() })) },
      h2: { installed: 9, total: 10, details: mockUsers.map(u => ({ userId: u.userId, userName: u.userName, installed: Math.random() > 0.1, version: '1.0.0', lastCheckedAt: new Date().toISOString() })) },
    },
  }
}

export function mockSkills() {
  return {
    skills: [
      { id: 's1', name: 'Commit', slug: 'commit', description: 'Generate conventional commits', content: '# Commit\n...', files: { 'SKILL.md': '# Commit' }, teams: [], is_global: true, keywords: ['commit', 'git'], primary_keywords: ['commit'], secondary_keywords: ['git'], hint: 'Use /commit after staging', contributors: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 's2', name: 'Review PR', slug: 'review-pr', description: 'Review pull requests with AI', content: '# Review PR\n...', files: { 'SKILL.md': '# Review PR' }, teams: ['backend'], is_global: false, keywords: ['review', 'pr'], primary_keywords: ['review'], secondary_keywords: ['pr'], hint: '', contributors: ['Alice Kim'], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 's3', name: 'Test Generator', slug: 'test', description: 'Generate test cases', content: '# Test\n...', files: { 'SKILL.md': '# Test' }, teams: ['frontend', 'backend'], is_global: false, keywords: ['test'], primary_keywords: ['test'], secondary_keywords: [], hint: '', contributors: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    teams: ['backend', 'frontend', 'devops'],
    users: mockUsers.map(u => ({ id: u.userId, name: u.userName })),
  }
}

export function mockSkillStats() {
  return {
    disableCounts: { s1: 1, s2: 0, s3: 2 },
    totalActiveUsers: 10,
  }
}

export function mockMCP() {
  return {
    servers: [
      { id: 'm1', name: 'GitHub', url: '', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: '***' }, teams: [], is_global: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'm2', name: 'Slack', url: 'https://mcp.slack.com/sse', command: '', args: [], env: {}, teams: ['backend'], is_global: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    teams: ['backend', 'frontend', 'devops'],
    installStatus: {
      m1: { installed: 8, total: 10, details: mockUsers.map(u => ({ userId: u.userId, userName: u.userName, installed: Math.random() > 0.2, version: '1.0.0', lastCheckedAt: new Date().toISOString() })) },
    },
  }
}

export function mockTeamUsers() {
  return {
    users: mockUsers.map(u => ({
      id: u.userId,
      email: u.email,
      name: u.userName,
      team: u.team,
      role: u.role,
      status: u.status,
      disabled_skills: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    teams: ['backend', 'frontend', 'devops'],
  }
}
