'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EyeOff, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SkillPreference {
  id: string
  name: string
  slug: string
  description: string | null
  is_global: boolean
  disabled: boolean
}

export default function MySkillsPage() {
  const [skills, setSkills] = useState<SkillPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [disabledCount, setDisabledCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/user/skills')
      const data = await res.json()
      if (res.ok) {
        setSkills(data.skills)
        setDisabledCount(data.disabledCount)
        setTotalCount(data.totalCount)
      }
    } catch (error) {
      console.error('Failed to fetch skills:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const toggleSkill = async (slug: string, disabled: boolean) => {
    setToggling(slug)
    try {
      const res = await fetch('/api/user/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, disabled }),
      })
      if (res.ok) {
        setSkills(prev => prev.map(s =>
          s.slug === slug ? { ...s, disabled } : s
        ))
        setDisabledCount(prev => disabled ? prev + 1 : prev - 1)
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const enabledCount = totalCount - disabledCount
  const enabledSkills = skills.filter(s => !s.disabled)
  const disabledSkills = skills.filter(s => s.disabled)

  const renderSkillRow = (skill: SkillPreference) => (
    <TableRow key={skill.id} className={skill.disabled ? 'opacity-60' : ''}>
      <TableCell>
        <div>
          <span className="font-medium">{skill.name}</span>
          {skill.description && (
            <div className="text-xs text-muted-foreground truncate max-w-[300px]">
              {skill.description}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="font-mono text-sm">/{skill.slug}</span>
      </TableCell>
      <TableCell>
        <Badge variant={skill.is_global ? 'default' : 'outline'}>
          {skill.is_global ? 'Global' : 'Team'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant={skill.disabled ? 'outline' : 'default'}
          size="sm"
          onClick={() => toggleSkill(skill.slug, !skill.disabled)}
          disabled={toggling === skill.slug}
          className="min-w-[100px]"
        >
          {toggling === skill.slug ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : skill.disabled ? (
            <>
              <Eye className="h-4 w-4 mr-1" />
              Enable
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4 mr-1" />
              Disable
            </>
          )}
        </Button>
      </TableCell>
    </TableRow>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Skills</h1>
        <p className="text-muted-foreground">
          Manage which skills are synced to your local environment
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Available</CardDescription>
            <CardTitle className="text-2xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enabled</CardDescription>
            <CardTitle className="text-2xl text-green-600">{enabledCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Disabled</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{disabledCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No skills available for your team.
        </div>
      ) : (
        <Tabs defaultValue="enabled">
          <TabsList>
            <TabsTrigger value="enabled">
              Enabled <Badge variant="secondary" className="ml-1">{enabledSkills.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="disabled">
              Disabled <Badge variant="outline" className="ml-1">{disabledSkills.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enabled">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>These skills are synced to your local environment.</CardDescription>
              </CardHeader>
              <CardContent>
                {enabledSkills.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No enabled skills. Switch to the Disabled tab to enable some.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enabledSkills.map(renderSkillRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disabled">
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardDescription>These skills will not be synced. Changes take effect on your next session.</CardDescription>
              </CardHeader>
              <CardContent>
                {disabledSkills.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No disabled skills.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disabledSkills.map(renderSkillRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
