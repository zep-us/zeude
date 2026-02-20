import Link from 'next/link'
import { ArrowLeft, Copy, RefreshCcw, UserPlus } from 'lucide-react'
import { getDemoAdminUsers } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function DemoTeamInvitePage() {
  const users = getDemoAdminUsers()
  const teams = Array.from(new Set(users.map((user) => user.team)))
  const inviteUrl = 'https://demo.zeude.mock/invite/team-platform-admin-4af2'

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
          <h1 className="text-3xl font-bold">Generate Invite Link</h1>
          <p className="text-muted-foreground">Preview of the admin invite flow in demo mode</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite Configuration</CardTitle>
          <CardDescription>Team and role can be selected in this mock flow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="team" className="text-sm font-medium">
                Team
              </label>
              <Input id="team" defaultValue={teams[1] || teams[0] || 'platform'} />
            </div>
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <Input id="role" defaultValue="member" />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-url" className="text-sm font-medium">
              Generated Invite URL
            </label>
            <Input id="invite-url" value={inviteUrl} readOnly className="font-mono text-xs" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t">
          <Button disabled>
            <UserPlus className="h-4 w-4 mr-2" />
            Generate Link
          </Button>
          <Button variant="outline" disabled>
            <Copy className="h-4 w-4 mr-2" />
            Copy URL
          </Button>
          <Button variant="outline" disabled>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
