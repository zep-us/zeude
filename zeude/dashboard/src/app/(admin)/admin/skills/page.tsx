'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Settings, Trash2, Copy, Check, X, Sparkles } from 'lucide-react'
import type { Skill } from '@/lib/database.types'

interface SkillFormData {
  name: string
  slug: string
  description: string
  content: string
  teams: string[]
  isGlobal: boolean
  primaryKeywords: string[]
  secondaryKeywords: string[]
  hint: string
}

const defaultFormData: SkillFormData = {
  name: '',
  slug: '',
  description: '',
  content: '',
  teams: [],
  isGlobal: false,
  primaryKeywords: [],
  secondaryKeywords: [],
  hint: '',
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<SkillFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate slug from name
  const [autoSlug, setAutoSlug] = useState(true)

  // Copy state
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/skills')
      const data = await res.json()

      if (res.ok) {
        setSkills(data.skills)
        setTeams(data.teams)
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

  function openCreateDialog() {
    setDialogMode('create')
    setEditingId(null)
    setFormData(defaultFormData)
    setAutoSlug(true)
    setError(null)
    setDialogOpen(true)
  }

  function openEditDialog(skill: Skill) {
    setDialogMode('edit')
    setEditingId(skill.id)
    setFormData({
      name: skill.name,
      slug: skill.slug,
      description: skill.description || '',
      content: skill.content,
      teams: skill.teams,
      isGlobal: skill.is_global,
      primaryKeywords: skill.primary_keywords || skill.keywords || [],
      secondaryKeywords: skill.secondary_keywords || [],
      hint: skill.hint || '',
    })
    setAutoSlug(false)
    setError(null)
    setDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData(prev => ({
      ...prev,
      name,
      slug: autoSlug ? generateSlug(name) : prev.slug,
    }))
  }

  function handleSlugChange(slug: string) {
    setAutoSlug(false)
    setFormData(prev => ({ ...prev, slug }))
  }

  function toggleTeam(team: string) {
    if (formData.teams.includes(team)) {
      setFormData({ ...formData, teams: formData.teams.filter(t => t !== team) })
    } else {
      setFormData({ ...formData, teams: [...formData.teams, team] })
    }
  }

  async function copySlug(slug: string) {
    try {
      await navigator.clipboard.writeText(`/${slug}`)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  async function handleSave() {
    if (!formData.name || !formData.slug || !formData.content) return

    setSaving(true)
    setError(null)

    try {
      const url = dialogMode === 'create' ? '/api/admin/skills' : `/api/admin/skills/${editingId}`
      const method = dialogMode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          description: formData.description || null,
          content: formData.content,
          teams: formData.teams,
          isGlobal: formData.isGlobal,
          primaryKeywords: formData.primaryKeywords,
          secondaryKeywords: formData.secondaryKeywords,
          hint: formData.hint || null,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setDialogOpen(false)
        fetchSkills()
      } else {
        setError(data.error || 'Failed to save skill')
      }
    } catch (error) {
      console.error('Failed to save skill:', error)
      setError('Failed to save skill')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingSkill) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/skills/${deletingSkill.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteOpen(false)
        fetchSkills()
      }
    } catch (error) {
      console.error('Failed to delete skill:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground">
            Manage reusable prompts and workflows for team members
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Skill
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : skills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No skills configured. Add your first skill to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{skill.name}</div>
                        {skill.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {skill.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => copySlug(skill.slug)}
                        className="flex items-center gap-1 font-mono text-sm hover:text-primary transition-colors"
                        title="Copy slug"
                      >
                        /{skill.slug}
                        {copiedSlug === skill.slug ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      {skill.is_global ? (
                        <Badge>All Teams</Badge>
                      ) : skill.teams.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {skill.teams.map((team) => (
                            <Badge key={team} variant="outline">{team}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={skill.status === 'active' ? 'default' : 'secondary'}>
                        {skill.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditDialog(skill)}
                          title="Edit skill"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => { setDeletingSkill(skill); setDeleteOpen(true) }}
                          title="Delete skill"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Skills are synced to team members on their next claude execution. Use /{'{slug}'} to invoke.
          </p>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Add Skill' : 'Edit Skill'}</DialogTitle>
            <DialogDescription>
              Create reusable prompts and workflows for your team
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Code Review"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">/</span>
                  <Input
                    value={formData.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="e.g., code-review"
                    className="font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Used to invoke the skill: /{formData.slug || 'slug'}
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this skill does"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Content (Markdown)</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Enter the skill content in Markdown format...

Example:
# Code Review

Please review the following code for:
- Code quality and best practices
- Potential bugs or security issues
- Performance improvements
- Readability and maintainability"
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            {/* Keyword Tier Management */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Skill Hint Keywords</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // TODO: Call LLM to auto-classify keywords
                    setError('Auto-classify coming soon')
                  }}
                  disabled={saving}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Auto-classify
                </Button>
              </div>

              {/* Primary Keywords */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Primary Keywords (trigger alone - high confidence)
                </label>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[32px] p-2 border rounded bg-background">
                  {formData.primaryKeywords.map((kw, i) => (
                    <Badge key={i} variant="default" className="gap-1">
                      {kw}
                      <button
                        onClick={() => setFormData({
                          ...formData,
                          primaryKeywords: formData.primaryKeywords.filter((_, idx) => idx !== i)
                        })}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    placeholder="Type and press Enter"
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        e.preventDefault()
                        const kw = e.currentTarget.value.trim().toLowerCase()
                        // Use functional update to avoid race conditions
                        setFormData((prev) => ({
                          ...prev,
                          primaryKeywords: prev.primaryKeywords.includes(kw)
                            ? prev.primaryKeywords
                            : [...prev.primaryKeywords, kw],
                        }))
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g., &quot;slack&quot;, &quot;prd&quot;, &quot;clickhouse&quot; - unique identifiers
                </p>
              </div>

              {/* Secondary Keywords */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Secondary Keywords (need 2+ matches)
                </label>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[32px] p-2 border rounded bg-background">
                  {formData.secondaryKeywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {kw}
                      <button
                        onClick={() => setFormData({
                          ...formData,
                          secondaryKeywords: formData.secondaryKeywords.filter((_, idx) => idx !== i)
                        })}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    placeholder="Type and press Enter"
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        e.preventDefault()
                        const kw = e.currentTarget.value.trim().toLowerCase()
                        // Use functional update to avoid race conditions
                        setFormData((prev) => ({
                          ...prev,
                          secondaryKeywords: prev.secondaryKeywords.includes(kw)
                            ? prev.secondaryKeywords
                            : [...prev.secondaryKeywords, kw],
                        }))
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g., &quot;message&quot;, &quot;send&quot;, &quot;create&quot; - generic terms
                </p>
              </div>

              {/* Hint */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Hint (shown to Claude when skill is suggested)
                </label>
                <Input
                  value={formData.hint}
                  onChange={(e) => setFormData({ ...formData, hint: e.target.value })}
                  placeholder="1-2 sentence guidance for when to use this skill"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Teams</label>
              <div className="space-y-2 mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isGlobal}
                    onChange={(e) => setFormData({ ...formData, isGlobal: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">All Teams (Global)</span>
                </label>
                {!formData.isGlobal && teams.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {teams.map((team) => (
                      <label key={team} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.teams.includes(team)}
                          onChange={() => toggleTeam(team)}
                          className="rounded"
                        />
                        <span className="text-sm">{team}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name || !formData.slug || !formData.content || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingSkill?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
