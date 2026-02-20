import Link from 'next/link'
import { Plus, Settings, Trash2, Sparkles } from 'lucide-react'
import { getDemoAdminSkills } from '@/lib/demo-mock'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function DemoAdminSkillsPage() {
  const skills = getDemoAdminSkills()
  const activeCount = skills.filter((s) => s.status === 'active').length
  const globalCount = skills.filter((s) => s.isGlobal).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground">Manage reusable prompts and workflows (mock admin)</p>
        </div>
        <Button asChild>
          <Link href="/demo/admin/skills/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Skill
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Configured Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skills.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Global Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skill Catalog</CardTitle>
          <CardDescription>Read-only mock dataset for admin UX preview</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{skill.name}</div>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">/{skill.slug}</TableCell>
                  <TableCell>
                    {skill.isGlobal ? (
                      <Badge>All Teams</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {skill.teams.map((team) => (
                          <Badge key={team} variant="outline">
                            {team}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={skill.status === 'active' ? 'default' : 'secondary'}>{skill.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(skill.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/skills/${skill.id}`} title="Preview hint">
                          <Sparkles className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="icon">
                        <Link href={`/demo/admin/skills/${skill.id}`} title="Edit skill">
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="icon" disabled title="Delete skill">
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
