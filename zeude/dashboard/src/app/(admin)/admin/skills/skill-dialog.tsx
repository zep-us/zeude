import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExternalLink, Sparkles, X, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkillFileEditor } from './skill-file-editor'
import type { SkillFormData } from './types'

interface SkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  formData: SkillFormData
  setFormData: React.Dispatch<React.SetStateAction<SkillFormData>>
  teams: string[]
  users: { id: string; name: string }[]
  autoSlug: boolean
  onNameChange: (name: string) => void
  onSlugChange: (slug: string) => void
  onToggleTeam: (team: string) => void
  onSave: () => Promise<void>
  saving: boolean
  error: string | null
  setError: (error: string | null) => void
}

export function SkillDialog({
  open,
  onOpenChange,
  mode,
  formData,
  setFormData,
  teams,
  users,
  onNameChange,
  onSlugChange,
  onToggleTeam,
  onSave,
  saving,
  error,
  setError,
}: SkillDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Skill' : 'Edit Skill'}</DialogTitle>
          <DialogDescription>
            Create reusable prompts and workflows for your team.{' '}
            <a
              href="https://docs.anthropic.com/en/docs/claude-code/skills"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              Skill syntax reference
              <ExternalLink className="h-3 w-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Name & Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="e.g., Code Review"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Slug</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/</span>
                <Input
                  value={formData.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder="e.g., code-review"
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Used to invoke the skill: /{formData.slug || 'slug'}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What this skill does and when to use it"
            />
          </div>

          {/* File Editor — SKILL.md + additional files */}
          <div>
            <label className="text-sm font-medium">Files</label>
            <div className="mt-2">
              <SkillFileEditor formData={formData} setFormData={setFormData} />
            </div>
          </div>

          {/* Keyword Tier Management */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Skill Hint Keywords</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError('Auto-classify coming soon')}
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
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        primaryKeywords: prev.primaryKeywords.filter((_, idx) => idx !== i),
                      }))}
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
                      setFormData(prev => ({
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
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        secondaryKeywords: prev.secondaryKeywords.filter((_, idx) => idx !== i),
                      }))}
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
                      setFormData(prev => ({
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
                onChange={(e) => setFormData(prev => ({ ...prev, hint: e.target.value }))}
                placeholder="1-2 sentence guidance for when to use this skill"
                className="mt-1"
              />
            </div>
          </div>

          {/* Contributors */}
          <div>
            <label className="text-sm font-medium flex items-center gap-1">
              <UserPlus className="h-4 w-4" />
              Contributors
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1 mt-2 min-h-[32px] p-2 border rounded bg-background">
              {formData.contributors.map((userId) => {
                const user = users.find(u => u.id === userId)
                return (
                  <Badge key={userId} variant="secondary" className="gap-1">
                    {user?.name || userId.slice(0, 8)}
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        contributors: prev.contributors.filter(id => id !== userId),
                      }))}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
              <select
                className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
                value=""
                onChange={(e) => {
                  const userId = e.target.value
                  if (userId && !formData.contributors.includes(userId)) {
                    setFormData(prev => ({
                      ...prev,
                      contributors: [...prev.contributors, userId],
                    }))
                  }
                }}
              >
                <option value="">Add contributor...</option>
                {users
                  .filter(u => !formData.contributors.includes(u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))
                }
              </select>
            </div>
          </div>

          {/* Teams */}
          <div>
            <label className="text-sm font-medium">Teams</label>
            <div className="space-y-2 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isGlobal}
                  onChange={(e) => setFormData(prev => ({ ...prev, isGlobal: e.target.checked }))}
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
                        onChange={() => onToggleTeam(team)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={!formData.name || !formData.slug || !formData.content || saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
