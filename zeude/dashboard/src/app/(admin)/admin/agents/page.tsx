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
import { Plus, Settings, Trash2, Bot, ExternalLink } from 'lucide-react'
import type { Agent } from '@/lib/database.types'

interface AgentFormData {
  name: string
  description: string
  content: string // Main file content ({name}.md)
  teams: string[]
  isGlobal: boolean
}

const defaultFormData: AgentFormData = {
  name: '',
  description: '',
  content: '',
  teams: [],
  isGlobal: false,
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<AgentFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agents')
      const data = await res.json()

      if (res.ok) {
        setAgents(data.agents)
        setTeams(data.teams)
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  function openCreateDialog() {
    setDialogMode('create')
    setEditingId(null)
    setFormData(defaultFormData)
    setError(null)
    setDialogOpen(true)
  }

  function openEditDialog(agent: Agent) {
    setDialogMode('edit')
    setEditingId(agent.id)

    // Extract main content from files (first .md file matching agent name, or first file)
    let mainContent = ''
    if (agent.files) {
      const mainFile = agent.files[`${agent.name}.md`]
      if (mainFile) {
        mainContent = mainFile
      } else {
        // Use the first file's content
        const firstKey = Object.keys(agent.files)[0]
        if (firstKey) {
          mainContent = agent.files[firstKey]
        }
      }
    }

    setFormData({
      name: agent.name,
      description: agent.description || '',
      content: mainContent,
      teams: agent.teams,
      isGlobal: agent.is_global,
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
    if (!formData.name || !formData.content) return

    setSaving(true)
    setError(null)

    try {
      const url = dialogMode === 'create' ? '/api/admin/agents' : `/api/admin/agents/${editingId}`
      const method = dialogMode === 'create' ? 'POST' : 'PATCH'

      // Build files object: single file named {name}.md
      const files: Record<string, string> = {
        [`${formData.name}.md`]: formData.content,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          files,
          teams: formData.teams,
          isGlobal: formData.isGlobal,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setDialogOpen(false)
        fetchAgents()
      } else {
        setError(data.error || 'Failed to save agent')
      }
    } catch (error) {
      console.error('Failed to save agent:', error)
      setError('Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingAgent) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/agents/${deletingAgent.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteOpen(false)
        fetchAgents()
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleStatus(agent: Agent) {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchAgents()
      }
    } catch (error) {
      console.error('Failed to toggle agent status:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            Manage AI role profiles installed to ~/.claude/agents/
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Agent
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No agents configured. Add your first agent to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium font-mono">{agent.name}</span>
                        </div>
                        {agent.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[250px] ml-6">
                            {agent.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {agent.is_global ? (
                        <Badge>All Teams</Badge>
                      ) : agent.teams.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {agent.teams.map((team) => (
                            <Badge key={team} variant="outline">{team}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleStatus(agent)}>
                        <Badge
                          variant={agent.status === 'active' ? 'default' : 'secondary'}
                          className="cursor-pointer"
                        >
                          {agent.status}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditDialog(agent)}
                          title="Edit agent"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => { setDeletingAgent(agent); setDeleteOpen(true) }}
                          title="Delete agent"
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
            Agents are synced to team members on their next claude execution.
            Installed to ~/.claude/agents/{'{name}'}.md
          </p>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Add Agent' : 'Edit Agent'}</DialogTitle>
            <DialogDescription>
              Create AI role profiles that team members can use with Claude Code.{' '}
              <a
                href="https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                Agent syntax reference
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

            <div>
              <label className="text-sm font-medium">Name (kebab-case)</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., code-critic"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters and hyphens only.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="When Claude should delegate to this subagent"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Agent Prompt (Markdown)</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={`---
name: data-scientist
description: Data analysis expert for SQL queries, BigQuery operations, and data insights.
model: sonnet
---

You are a data scientist specializing in SQL and BigQuery analysis.

When invoked:
1. Understand the data analysis requirement
2. Write efficient SQL queries
3. Analyze and summarize results
4. Present findings clearly

Key practices:
- Write optimized SQL queries with proper filters
- Use appropriate aggregations and joins
- Format results for readability`}
                className="min-h-[300px] font-mono text-sm"
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
              disabled={!formData.name || !formData.content || saving}
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
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingAgent?.name}&quot;? This action cannot be undone.
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
