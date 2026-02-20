import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function DemoNewSkillPage() {
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="outline" size="sm" className="mb-3">
          <Link href="/demo/admin/skills">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Skills
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Add Skill</h1>
        <p className="text-muted-foreground">Mock create flow for reusable prompt skills</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skill Metadata</CardTitle>
          <CardDescription>Fill in the same fields as internal skill registration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" placeholder="e.g., Release Notes Composer" />
            </div>
            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium">
                Slug
              </label>
              <Input id="slug" placeholder="release-notes" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea id="description" placeholder="What this skill does and when to use it" />
          </div>
          <div className="space-y-2">
            <label htmlFor="content" className="text-sm font-medium">
              Prompt Content
            </label>
            <Textarea
              id="content"
              className="min-h-40 font-mono text-xs"
              placeholder="You are an assistant that drafts release notes..."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="teams" className="text-sm font-medium">
                Teams (comma-separated)
              </label>
              <Input id="teams" placeholder="platform, frontend" />
            </div>
            <div className="space-y-2">
              <label htmlFor="hint" className="text-sm font-medium">
                Hint
              </label>
              <Input id="hint" placeholder="Try this skill when preparing release cut notes" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Skill
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo/admin/skills">Cancel</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
