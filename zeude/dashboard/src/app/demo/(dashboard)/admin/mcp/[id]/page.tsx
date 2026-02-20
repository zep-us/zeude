import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Copy, Save } from 'lucide-react'
import { getDemoAdminMCPServerById } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface DemoMCPDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function DemoMCPDetailPage({ params }: DemoMCPDetailPageProps) {
  const { id } = await params
  const server = getDemoAdminMCPServerById(id)

  if (!server) {
    notFound()
  }

  const installCommand = `${server.command} ${server.args.join(' ')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/demo/admin/mcp">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to MCP Servers
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Edit MCP Server</h1>
          <p className="text-muted-foreground">Mock detail view for MCP rollout and command configuration</p>
        </div>
        <Badge variant={server.status === 'active' ? 'default' : 'secondary'}>{server.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Configuration</CardTitle>
          <CardDescription>The same data shape as internal MCP editing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" defaultValue={server.name} />
            </div>
            <div className="space-y-2">
              <label htmlFor="command" className="text-sm font-medium">
                Command
              </label>
              <Input id="command" defaultValue={server.command} className="font-mono" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="args" className="text-sm font-medium">
              Arguments
            </label>
            <Input id="args" defaultValue={server.args.join(' ')} className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <label htmlFor="env" className="text-sm font-medium">
              Environment Variables
            </label>
            <Textarea
              id="env"
              className="font-mono text-xs"
              defaultValue={'API_TOKEN=***\nORG_ID=demo-org'}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="teams" className="text-sm font-medium">
                Teams
              </label>
              <Input id="teams" defaultValue={server.isGlobal ? 'All Teams' : server.teams.join(', ')} />
            </div>
            <div className="space-y-2">
              <label htmlFor="coverage" className="text-sm font-medium">
                Install Coverage
              </label>
              <Input id="coverage" value={`${server.installed}/${server.total}`} readOnly />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" disabled>
            <Copy className="h-4 w-4 mr-2" />
            Copy Install Command
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Install Command Preview</CardTitle>
          <CardDescription>Demo-only preview of command distributed to users</CardDescription>
        </CardHeader>
        <CardContent>
          <Input value={installCommand} readOnly className="font-mono text-xs" />
        </CardContent>
      </Card>
    </div>
  )
}
