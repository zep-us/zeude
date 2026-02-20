import Link from 'next/link'
import { Plus, Users, Settings, Trash2 } from 'lucide-react'
import { getDemoAdminHooks } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function DemoAdminHooksPage() {
  const hooks = getDemoAdminHooks()
  const activeCount = hooks.filter((h) => h.status === 'active').length
  const coverageAverage = hooks.length
    ? Math.round(hooks.reduce((acc, h) => acc + (h.total > 0 ? (h.installed / h.total) * 100 : 0), 0) / hooks.length)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hooks</h1>
          <p className="text-muted-foreground">Manage Claude Code hooks and rollout status (mock admin)</p>
        </div>
        <Button asChild>
          <Link href="/demo/admin/hooks/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Hook
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Configured Hooks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hooks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Hooks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coverageAverage}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hook Deployments</CardTitle>
          <CardDescription>Read-only mock dataset for admin UX preview</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hooks.map((hook) => (
                <TableRow key={hook.id}>
                  <TableCell className="font-medium">{hook.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{hook.event}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{hook.scriptType}</TableCell>
                  <TableCell>
                    {hook.isGlobal ? (
                      <Badge>All Teams</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {hook.teams.map((team) => (
                          <Badge key={team} variant="outline">
                            {team}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={hook.status === 'active' ? 'default' : 'secondary'}>{hook.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {hook.installed}/{hook.total}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/hooks/${hook.id}`} title="Install status">
                          <Users className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/hooks/${hook.id}`} title="Edit hook">
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="icon" disabled title="Delete hook">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
