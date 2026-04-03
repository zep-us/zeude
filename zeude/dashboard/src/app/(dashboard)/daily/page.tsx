import dynamic from 'next/dynamic'
import { getUser } from '@/lib/session'
import { getDailyStats, parseSourceParam } from '@/lib/clickhouse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SourceFilter as SourceFilterComponent } from '@/components/dashboard/source-filter'

const CostChart = dynamic(
  () => import('@/components/charts/cost-chart').then(m => ({ default: m.CostChart })),
  { loading: () => <div className="h-[300px] bg-muted animate-pulse rounded-lg" /> }
)

const TokenChart = dynamic(
  () => import('@/components/charts/token-chart').then(m => ({ default: m.TokenChart })),
  { loading: () => <div className="h-[300px] bg-muted animate-pulse rounded-lg" /> }
)

interface DailyPageProps {
  searchParams: Promise<{ source?: string }>
}

export default async function DailyPage({ searchParams }: DailyPageProps) {
  const user = await getUser()
  const params = await searchParams
  const source = parseSourceParam(params.source ?? null)

  let stats: Awaited<ReturnType<typeof getDailyStats>> = []

  try {
    stats = await getDailyStats(user.email, user.id, 30, source)
  } catch (error) {
    console.error('Failed to fetch daily stats:', error)
  }

  // Calculate totals (ClickHouse may return strings, so convert to numbers)
  const totals = stats.reduce(
    (acc, day) => ({
      sessions: acc.sessions + Number(day.sessions),
      cost: acc.cost + Number(day.cost),
      input_tokens: acc.input_tokens + Number(day.input_tokens),
      output_tokens: acc.output_tokens + Number(day.output_tokens),
    }),
    { sessions: 0, cost: 0, input_tokens: 0, output_tokens: 0 }
  )

  // Pre-process chart data server-side to minimize serialization payload
  const costData = stats.map(d => ({ date: d.date, cost: Number(d.cost) }))
  const tokenData = stats.map(d => ({ date: d.date, input: Number(d.input_tokens), output: Number(d.output_tokens) }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Statistics</h1>
          <p className="text-muted-foreground">
            Usage trends over the last 30 days
          </p>
        </div>
        <SourceFilterComponent useSearchParams />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 stagger-children">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">30-Day Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.sessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">30-Day Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totals.cost.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Input Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.input_tokens.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Output Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.output_tokens.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <CostChart data={costData} />
        <TokenChart data={tokenData} />
      </div>

      {/* Daily Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Breakdown</CardTitle>
          <CardDescription>Detailed usage by day</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No usage data available. Start using Claude Code or Codex to see your daily stats.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Input Tokens</TableHead>
                  <TableHead>Output Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell className="font-medium">
                      {new Date(day.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>{Number(day.sessions)}</TableCell>
                    <TableCell>{Number(day.input_tokens).toLocaleString()}</TableCell>
                    <TableCell>{Number(day.output_tokens).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(day.cost).toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
