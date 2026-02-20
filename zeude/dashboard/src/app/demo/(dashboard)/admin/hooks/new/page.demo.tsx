import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function DemoNewHookPage() {
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="outline" size="sm" className="mb-3">
          <Link href="/demo/admin/hooks">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Hooks
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Add Hook</h1>
        <p className="text-muted-foreground">Mock create flow for Claude Code hook automation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hook Configuration</CardTitle>
          <CardDescription>Simulates the internal create-hook dialog as a full page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" placeholder="e.g., Prompt Logger" />
            </div>
            <div className="space-y-2">
              <label htmlFor="event" className="text-sm font-medium">
                Event
              </label>
              <Input id="event" placeholder="UserPromptSubmit" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium">
                Script Type
              </label>
              <Input id="type" placeholder="node" />
            </div>
            <div className="space-y-2">
              <label htmlFor="teams" className="text-sm font-medium">
                Teams
              </label>
              <Input id="teams" placeholder="security, platform" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea id="description" placeholder="What this hook does and why it exists" />
          </div>
          <div className="space-y-2">
            <label htmlFor="script" className="text-sm font-medium">
              Script Content
            </label>
            <Textarea
              id="script"
              className="min-h-40 font-mono text-xs"
              placeholder="console.log('hook executed')"
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Hook
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo/admin/hooks">Cancel</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
