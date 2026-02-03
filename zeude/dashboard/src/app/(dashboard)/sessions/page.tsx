import { getUser } from '@/lib/session'
import { getSessionsToday } from '@/lib/clickhouse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

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
    second: '2-digit',
  })
}

export default async function SessionsPage() {
  const user = await getUser()

  let sessions: Awaited<ReturnType<typeof getSessionsToday>> = []

  try {
    sessions = await getSessionsToday(user.email, user.id)
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Sessions</h1>
        <p className="text-muted-foreground">
          Browse your Claude Code sessions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Sessions</CardTitle>
          <CardDescription>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded today
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sessions recorded today. Start using Claude Code to see your sessions here.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Input Tokens</TableHead>
                  <TableHead>Output Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.session_id}>
                    <TableCell className="font-mono text-xs">
                      {session.session_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{formatTime(session.started_at)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatDuration(session.started_at, session.ended_at)}
                      </Badge>
                    </TableCell>
                    <TableCell>{Number(session.event_count)}</TableCell>
                    <TableCell>{Number(session.input_tokens).toLocaleString()}</TableCell>
                    <TableCell>{Number(session.output_tokens).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(session.total_cost || 0).toFixed(4)}
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
