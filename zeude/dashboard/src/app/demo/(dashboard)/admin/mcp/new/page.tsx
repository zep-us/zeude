import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function DemoNewMCPServerPage() {
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="outline" size="sm" className="mb-3">
          <Link href="/demo/admin/mcp">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to MCP Servers
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Add MCP Server</h1>
        <p className="text-muted-foreground">Mock registration flow for MCP server configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Configuration</CardTitle>
          <CardDescription>Same fields as internal MCP create flow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" placeholder="e.g., GitHub Enterprise" />
            </div>
            <div className="space-y-2">
              <label htmlFor="command" className="text-sm font-medium">
                Command
              </label>
              <Input id="command" placeholder="npx" className="font-mono" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="args" className="text-sm font-medium">
              Arguments
            </label>
            <Input id="args" placeholder="-y @modelcontextprotocol/server-github" className="font-mono" />
          </div>
          <div className="space-y-2">
            <label htmlFor="env" className="text-sm font-medium">
              Environment Variables
            </label>
            <Textarea id="env" className="font-mono text-xs" placeholder="GITHUB_TOKEN=***" />
          </div>
          <div className="space-y-2">
            <label htmlFor="teams" className="text-sm font-medium">
              Teams (comma-separated or All Teams)
            </label>
            <Input id="teams" placeholder="platform, frontend" />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Server
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo/admin/mcp">Cancel</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
