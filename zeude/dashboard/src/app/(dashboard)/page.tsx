import { getUser } from '@/lib/session'
import { getSessionsToday, getOverviewStats, parseSourceParam, type SessionSummary, type OverviewStats } from '@/lib/clickhouse'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RecentSessions } from '@/components/dashboard/recent-sessions'
import { SourceFilter as SourceFilterComponent } from '@/components/dashboard/source-filter'
import { Activity, DollarSign, Hash, Zap } from 'lucide-react'

interface OverviewPageProps {
  searchParams: Promise<{ source?: string }>
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const user = await getUser()
  const params = await searchParams
  const source = parseSourceParam(params.source ?? null)

  let sessions: SessionSummary[] = []
  let todayStats: OverviewStats = {
    total_sessions: 0,
    total_cost: 0,
    total_input_tokens: 0,
    total_output_tokens: 0
  }

  try {
    const results = await Promise.all([
      getSessionsToday(user.email, user.id, source),
      getOverviewStats(user.email, user.id, source),
    ])
    sessions = results[0]
    todayStats = results[1]
  } catch (error) {
    console.error('Failed to fetch ClickHouse data:', error)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Overview</h1>
          <p className="text-muted-foreground">
            Your AI coding tool usage for today (Claude Code &amp; Codex)
          </p>
        </div>
        <SourceFilterComponent useSearchParams />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
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
