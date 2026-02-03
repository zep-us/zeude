import { getUser } from '@/lib/session'
import { getSessionsToday, getOverviewStats, type SessionSummary, type OverviewStats } from '@/lib/clickhouse'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RecentSessions } from '@/components/dashboard/recent-sessions'
import { Activity, DollarSign, Hash, Zap } from 'lucide-react'

export default async function OverviewPage() {
  const user = await getUser()

  let sessions: SessionSummary[] = []
  let todayStats: OverviewStats = {
    total_sessions: 0,
    total_cost: 0,
    total_input_tokens: 0,
    total_output_tokens: 0
  }

  try {
    const results = await Promise.all([
      getSessionsToday(user.email, user.id),
      getOverviewStats(user.email, user.id),
    ])
    sessions = results[0]
    todayStats = results[1]
  } catch (error) {
    console.error('Failed to fetch ClickHouse data:', error)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground">
          Your Claude Code usage for today
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Sessions Today"
          value={Number(todayStats.total_sessions)}
          icon={Activity}
          description="Active coding sessions"
        />
        <StatsCard
          title="Cost Today"
          value={`$${Number(todayStats.total_cost).toFixed(4)}`}
          icon={DollarSign}
          description="API usage cost"
        />
        <StatsCard
          title="Input Tokens"
          value={Number(todayStats.total_input_tokens).toLocaleString()}
          icon={Hash}
          description="Prompts and context"
        />
        <StatsCard
          title="Output Tokens"
          value={Number(todayStats.total_output_tokens).toLocaleString()}
          icon={Zap}
          description="Generated responses"
        />
      </div>

      <RecentSessions sessions={sessions.slice(0, 10)} />
    </div>
  )
}
