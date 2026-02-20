import Link from 'next/link'
import { Plus, Copy, Settings, Trash2 } from 'lucide-react'
import { getDemoAdminMCPServers } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function formatArgs(args: string[]): string {
  return args.join(' ')
}

export default function DemoAdminMCPPage() {
  const servers = getDemoAdminMCPServers()
  const activeCount = servers.filter((s) => s.status === 'active').length
  const totalInstallTarget = servers.reduce((acc, s) => acc + s.total, 0)
  const totalInstalled = servers.reduce((acc, s) => acc + s.installed, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground">Manage MCP servers synced to team members (mock admin)</p>
        </div>
        <Button asChild>
          <Link href="/demo/admin/mcp/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Server
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Configured Servers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{servers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Servers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Install Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalInstalled}/{totalInstallTarget}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Registry</CardTitle>
          <CardDescription>Read-only mock dataset for admin UX preview</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {server.command} {formatArgs(server.args)}
                  </TableCell>
                  <TableCell>
                    {server.isGlobal ? (
                      <Badge>All Teams</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {server.teams.map((team) => (
                          <Badge key={team} variant="outline">
                            {team}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={server.status === 'active' ? 'default' : 'secondary'}>
                      {server.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {server.installed}/{server.total}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/mcp/${server.id}`} title="Copy install command">
                          <Copy className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/mcp/${server.id}`} title="Edit server">
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="icon" disabled title="Delete server">
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
