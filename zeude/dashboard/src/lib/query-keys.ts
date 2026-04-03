export const queryKeys = {
  leaderboard: {
    all: ['leaderboard'] as const,
    filtered: (cohort: string, source: string) =>
      ['leaderboard', { cohort, source }] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    overview: (period: string, source: string, compare: boolean) =>
      ['analytics', 'overview', { period, source, compare }] as const,
    userUsage: (period: string, page: number, search: string) =>
      ['analytics', 'userUsage', { period, page, search }] as const,
    userInsights: (userId: string, source: string) =>
      ['analytics', 'userInsights', { userId, source }] as const,
  },
  hooks: {
    all: ['hooks'] as const,
  },
  skills: {
    all: ['skills'] as const,
  },
  team: {
    all: ['team'] as const,
    filtered: (team: string, status: string, search: string) =>
      ['team', { team, status, search }] as const,
  },
  mcp: {
    all: ['mcp'] as const,
  },
} as const
