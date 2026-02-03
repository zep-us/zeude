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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Settings, Trash2, Users } from 'lucide-react'
import type { Hook, HookEvent, HookScriptType } from '@/lib/database.types'

const HOOK_EVENTS: { value: HookEvent; label: string; description: string }[] = [
  { value: 'UserPromptSubmit', label: 'User Prompt Submit', description: 'Triggered when user submits a prompt' },
  { value: 'Stop', label: 'Stop', description: 'Triggered when execution stops' },
  { value: 'PreToolUse', label: 'Pre Tool Use', description: 'Triggered before a tool is used' },
  { value: 'PostToolUse', label: 'Post Tool Use', description: 'Triggered after a tool is used' },
  { value: 'Notification', label: 'Notification', description: 'Triggered on notifications' },
  { value: 'SubagentStop', label: 'Subagent Stop', description: 'Triggered when a subagent stops' },
]

const SCRIPT_TYPES: { value: HookScriptType; label: string }[] = [
  { value: 'bash', label: 'Bash' },
  { value: 'python', label: 'Python' },
  { value: 'node', label: 'Node.js' },
]

interface HookFormData {
  name: string
  event: HookEvent
  description: string
  scriptContent: string
  scriptType: HookScriptType
  env: Record<string, string>
  teams: string[]
  isGlobal: boolean
}

interface InstallStatusSummary {
  installed: number
  total: number
  details: Array<{
    userId: string
    userName: string
    installed: boolean
    version: string | null
    lastCheckedAt: string | null
  }>
}

const defaultFormData: HookFormData = {
  name: '',
  event: 'UserPromptSubmit',
  description: '',
  scriptContent: '',
  scriptType: 'bash',
  env: {},
  teams: [],
  isGlobal: false,
}

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [installStatus, setInstallStatus] = useState<Record<string, InstallStatusSummary>>({})
  const [loading, setLoading] = useState(true)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<HookFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingHook, setDeletingHook] = useState<Hook | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Status dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusHook, setStatusHook] = useState<Hook | null>(null)

  const fetchHooks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hooks')
      const data = await res.json()

      if (res.ok) {
        setHooks(data.hooks)
        setTeams(data.teams)
        setInstallStatus(data.installStatus || {})
      }
    } catch (error) {
      console.error('Failed to fetch hooks:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHooks()
  }, [fetchHooks])

  function openCreateDialog() {
    setDialogMode('create')
    setEditingId(null)
    setFormData(defaultFormData)
    setError(null)
    setDialogOpen(true)
  }

  function openEditDialog(hook: Hook) {
    setDialogMode('edit')
    setEditingId(hook.id)
    setFormData({
      name: hook.name,
      event: hook.event,
      description: hook.description || '',
      scriptContent: hook.script_content,
      scriptType: hook.script_type,
      env: hook.env || {},
      teams: hook.teams,
      isGlobal: hook.is_global,
    })
    setError(null)
    setDialogOpen(true)
  }

  function toggleTeam(team: string) {
    if (formData.teams.includes(team)) {
      setFormData({ ...formData, teams: formData.teams.filter(t => t !== team) })
    } else {
      setFormData({ ...formData, teams: [...formData.teams, team] })
    }
  }

  async function handleSave() {
    if (!formData.name || !formData.scriptContent) return

    setSaving(true)
    setError(null)

    try {
      const url = dialogMode === 'create' ? '/api/admin/hooks' : `/api/admin/hooks/${editingId}`
      const method = dialogMode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          event: formData.event,
          description: formData.description || null,
          scriptContent: formData.scriptContent,
          scriptType: formData.scriptType,
          env: formData.env,
          teams: formData.teams,
          isGlobal: formData.isGlobal,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setDialogOpen(false)
        fetchHooks()
      } else {
        setError(data.error || 'Failed to save hook')
      }
    } catch (error) {
      console.error('Failed to save hook:', error)
      setError('Failed to save hook')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingHook) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/hooks/${deletingHook.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteOpen(false)
        fetchHooks()
      }
    } catch (error) {
      console.error('Failed to delete hook:', error)
    } finally {
      setDeleting(false)
    }
  }

  const getEventLabel = (event: HookEvent) => {
    return HOOK_EVENTS.find(e => e.value === event)?.label || event
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hooks</h1>
          <p className="text-muted-foreground">
            Manage Claude Code hooks that sync to team members
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Hook
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : hooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hooks configured. Add your first hook to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.map((hook) => {
                  const status = installStatus[hook.id]
                  return (
                    <TableRow key={hook.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{hook.name}</div>
                          {hook.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {hook.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getEventLabel(hook.event)}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{hook.script_type}</span>
                      </TableCell>
                      <TableCell>
                        {hook.is_global ? (
                          <Badge>All Teams</Badge>
                        ) : hook.teams.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {hook.teams.slice(0, 2).map((team) => (
                              <Badge key={team} variant="outline">{team}</Badge>
                            ))}
                            {hook.teams.length > 2 && (
                              <Badge variant="outline">+{hook.teams.length - 2}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={hook.status === 'active' ? 'default' : 'secondary'}>
                          {hook.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <button
                            onClick={() => { setStatusHook(hook); setStatusDialogOpen(true) }}
                            className="text-sm hover:underline"
                          >
                            {status.installed}/{status.total}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => { setStatusHook(hook); setStatusDialogOpen(true) }}
                            title="View install status"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openEditDialog(hook)}
                            title="Edit hook"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => { setDeletingHook(hook); setDeleteOpen(true) }}
                            title="Delete hook"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Hooks are synced to team members on their next claude execution
          </p>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Add Hook' : 'Edit Hook'}</DialogTitle>
            <DialogDescription>
              Create hooks that execute during Claude Code events
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Prompt Logger"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Event</label>
                <Select
                  value={formData.event}
                  onValueChange={(value: HookEvent) => setFormData({ ...formData, event: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOOK_EVENTS.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        <div>
                          <div>{event.label}</div>
                          <div className="text-xs text-muted-foreground">{event.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Script Type</label>
                <Select
                  value={formData.scriptType}
                  onValueChange={(value: HookScriptType) => setFormData({ ...formData, scriptType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCRIPT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Script Content</label>
              <Textarea
                value={formData.scriptContent}
                onChange={(e) => setFormData({ ...formData, scriptContent: e.target.value })}
                placeholder={formData.scriptType === 'bash'
                  ? '#!/bin/bash\n\n# Read input from stdin\nread -r INPUT\n\n# Your logic here...'
                  : formData.scriptType === 'python'
                  ? '#!/usr/bin/env python3\nimport sys\nimport json\n\ninput_data = json.loads(sys.stdin.read())\n# Your logic here...'
                  : '#!/usr/bin/env node\nlet input = "";\nprocess.stdin.on("data", chunk => input += chunk);\nprocess.stdin.on("end", () => {\n  const data = JSON.parse(input);\n  // Your logic here...\n});'}
                className="min-h-[200px] font-mono text-sm"
              />
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
              disabled={!formData.name || !formData.scriptContent || saving}
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
            <DialogTitle>Delete Hook</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingHook?.name}&quot;? This action cannot be undone.
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

      {/* Install Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Status: {statusHook?.name}</DialogTitle>
            <DialogDescription>
              View which users have installed this hook
            </DialogDescription>
          </DialogHeader>
          {statusHook && installStatus[statusHook.id] && (
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installStatus[statusHook.id].details.map((detail) => (
                    <TableRow key={detail.userId}>
                      <TableCell>{detail.userName}</TableCell>
                      <TableCell>
                        <Badge variant={detail.installed ? 'default' : 'secondary'}>
                          {detail.installed ? 'Installed' : 'Not Installed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {detail.lastCheckedAt
                          ? new Date(detail.lastCheckedAt).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
