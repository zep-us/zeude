import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { getDemoAdminSkillById, getDemoAdminSkills } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface DemoSkillDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export function generateStaticParams() {
  return getDemoAdminSkills().map((skill) => ({ id: skill.id }))
}

export default async function DemoSkillDetailPage({ params }: DemoSkillDetailPageProps) {
  const { id } = await params
  const skill = getDemoAdminSkillById(id)

  if (!skill) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/demo/admin/skills">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Skills
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Edit Skill</h1>
          <p className="text-muted-foreground">Mock detail view for skill configuration</p>
        </div>
        <Badge variant={skill.status === 'active' ? 'default' : 'secondary'}>{skill.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skill Metadata</CardTitle>
          <CardDescription>Matches the create/edit flow from internal admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" defaultValue={skill.name} />
            </div>
            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium">
                Slug
              </label>
              <Input id="slug" defaultValue={skill.slug} />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea id="description" defaultValue={skill.description} />
          </div>
          <div className="space-y-2">
            <label htmlFor="content" className="text-sm font-medium">
              Prompt Content
            </label>
            <Textarea
              id="content"
              className="min-h-40 font-mono text-xs"
              defaultValue={`# ${skill.name}\n\nUse this mock content to demonstrate skill editing UI in the open demo.`}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="teams" className="text-sm font-medium">
                Teams
              </label>
              <Input id="teams" defaultValue={skill.isGlobal ? 'All Teams' : skill.teams.join(', ')} />
            </div>
            <div className="space-y-2">
              <label htmlFor="updated" className="text-sm font-medium">
                Last Updated
              </label>
              <Input id="updated" value={new Date(skill.updatedAt).toLocaleString()} readOnly />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 border-t">
          <Button disabled>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo/admin/skills">Cancel</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
