import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { SessionSummary } from '@/lib/clickhouse'

interface RecentSessionsProps {
  sessions: SessionSummary[]
}

function formatDuration(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  const durationMs = end.getTime() - start.getTime()

  if (durationMs < 60000) {
    return `${Math.round(durationMs / 1000)}s`
  } else if (durationMs < 3600000) {
    return `${Math.round(durationMs / 60000)}m`
  } else {
    const hours = Math.floor(durationMs / 3600000)
    const mins = Math.round((durationMs % 3600000) / 60000)
    return `${hours}h ${mins}m`
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>No sessions recorded today</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sessions</CardTitle>
        <CardDescription>Your Claude Code sessions from today</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.session_id}>
                <TableCell className="font-medium">
                  {formatTime(session.started_at)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {formatDuration(session.started_at, session.ended_at)}
                  </Badge>
                </TableCell>
                <TableCell>{Number(session.event_count)}</TableCell>
                <TableCell>
                  {(Number(session.input_tokens) + Number(session.output_tokens)).toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${Number(session.total_cost || 0).toFixed(4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
