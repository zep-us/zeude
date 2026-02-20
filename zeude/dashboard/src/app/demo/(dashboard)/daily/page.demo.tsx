import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CostChart } from '@/components/charts/cost-chart'
import { TokenChart } from '@/components/charts/token-chart'
import { getDemoDailyStats } from '@/lib/demo-mock'

export default function DemoDailyPage() {
  const stats = getDemoDailyStats(30)

  const totals = stats.reduce(
    (acc, day) => ({
      sessions: acc.sessions + Number(day.sessions),
      cost: acc.cost + Number(day.cost),
      input_tokens: acc.input_tokens + Number(day.input_tokens),
      output_tokens: acc.output_tokens + Number(day.output_tokens),
    }),
    { sessions: 0, cost: 0, input_tokens: 0, output_tokens: 0 }
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Daily Statistics</h1>
        <p className="text-muted-foreground">Usage trends over the last 30 days (mock dataset)</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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

      <div className="grid gap-6 md:grid-cols-2">
        <CostChart data={stats} />
        <TokenChart data={stats} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Breakdown</CardTitle>
          <CardDescription>Detailed usage by day</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No usage data available.</div>
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
                    <TableCell className="text-right font-mono">${Number(day.cost).toFixed(4)}</TableCell>
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
