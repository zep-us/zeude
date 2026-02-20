import { Activity, DollarSign, Hash, Zap } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RecentSessions } from '@/components/dashboard/recent-sessions'
import { getDemoOverviewStats, getDemoSessionsToday } from '@/lib/demo-mock'

export default function DemoOverviewPage() {
  const sessions = getDemoSessionsToday()
  const todayStats = getDemoOverviewStats()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground">Your Claude Code usage for today (mock dataset)</p>
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
          description="API usage cost (synthetic)"
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
