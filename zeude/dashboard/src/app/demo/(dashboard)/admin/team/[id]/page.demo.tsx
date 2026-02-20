import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, KeyRound, Save, Trash2 } from 'lucide-react'
import { getDemoAdminUserById, getDemoAdminUsers } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface DemoTeamMemberDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export function generateStaticParams() {
  return getDemoAdminUsers().map((user) => ({ id: user.id }))
}

export default async function DemoTeamMemberDetailPage({ params }: DemoTeamMemberDetailPageProps) {
  const { id } = await params
  const user = getDemoAdminUserById(id)

  if (!user) {
    notFound()
  }

  const mockAgentKey = `zdk_${user.id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}_demo_only`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/demo/admin/team">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Team
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Edit Member</h1>
          <p className="text-muted-foreground">Mock detail view for member profile, role, and key management</p>
        </div>
        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Fields are editable in the demo UI but do not persist</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" defaultValue={user.name} />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" defaultValue={user.email} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="team" className="text-sm font-medium">
                Team
              </label>
              <Input id="team" defaultValue={user.team} />
            </div>
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <Input id="role" defaultValue={user.role} />
            </div>
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <Input id="status" defaultValue={user.status} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" disabled>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Member
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Key</CardTitle>
          <CardDescription>Same UX as internal key management, populated with demo-only value</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={mockAgentKey} readOnly className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Last seen: {new Date(user.lastSeen).toLocaleString()}
          </p>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button variant="outline" disabled>
            <KeyRound className="h-4 w-4 mr-2" />
            Generate New Key
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
