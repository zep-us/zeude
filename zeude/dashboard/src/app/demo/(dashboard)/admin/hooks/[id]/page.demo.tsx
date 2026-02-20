import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Save, Users } from 'lucide-react'
import { getDemoAdminHookById, getDemoAdminHooks } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface DemoHookDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export function generateStaticParams() {
  return getDemoAdminHooks().map((hook) => ({ id: hook.id }))
}

export default async function DemoHookDetailPage({ params }: DemoHookDetailPageProps) {
  const { id } = await params
  const hook = getDemoAdminHookById(id)

  if (!hook) {
    notFound()
  }

  const coverage = hook.total > 0 ? Math.round((hook.installed / hook.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/demo/admin/hooks">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Hooks
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Edit Hook</h1>
          <p className="text-muted-foreground">Mock detail view for hook script and rollout controls</p>
        </div>
        <Badge variant={hook.status === 'active' ? 'default' : 'secondary'}>{hook.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hook Configuration</CardTitle>
          <CardDescription>Fields mirror the internal hook configuration flow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" defaultValue={hook.name} />
            </div>
            <div className="space-y-2">
              <label htmlFor="event" className="text-sm font-medium">
                Event
              </label>
              <Input id="event" defaultValue={hook.event} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium">
                Script Type
              </label>
              <Input id="type" defaultValue={hook.scriptType} />
            </div>
            <div className="space-y-2">
              <label htmlFor="teams" className="text-sm font-medium">
                Teams
              </label>
              <Input id="teams" defaultValue={hook.isGlobal ? 'All Teams' : hook.teams.join(', ')} />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="script" className="text-sm font-medium">
              Script Content
            </label>
            <Textarea
              id="script"
              className="min-h-40 font-mono text-xs"
              defaultValue={`# ${hook.name}\n# event: ${hook.event}\n# demo only hook script`}
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" disabled>
            <Users className="h-4 w-4 mr-2" />
            View Install Status
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rollout Status</CardTitle>
          <CardDescription>Mock install summary per hook</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Installed</p>
              <p className="text-2xl font-bold">{hook.installed}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Target Users</p>
              <p className="text-2xl font-bold">{hook.total}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Coverage</p>
              <p className="text-2xl font-bold">{coverage}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
