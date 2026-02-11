'use client'

import { useState, useCallback } from 'react'
import type { MCPServer } from '@/lib/database.types'
import type { MCPPreset } from '@/lib/mcp-presets'
import {
  type MCPFormData,
  type InstallStatusSummary,
  type RegistrationMode,
  type TestResult,
  defaultFormData,
} from './types'

export function useMCPState() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [installStatus, setInstallStatus] = useState<Record<string, InstallStatusSummary>>({})
  const [loading, setLoading] = useState(true)

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('preset')
  const [step, setStep] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<MCPFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  // Preset selection
  const [selectedPreset, setSelectedPreset] = useState<MCPPreset | null>(null)

  // JSON import
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [parsedServers, setParsedServers] = useState<{ name: string; config: { command: string; args?: string[]; env?: Record<string, string> } }[]>([])

  // Connection test state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingServer, setDeletingServer] = useState<MCPServer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Install status dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusServer, setStatusServer] = useState<MCPServer | null>(null)

  // Copy state
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mcp')
      const data = await res.json()

      if (res.ok) {
        setServers(data.servers)
        setTeams(data.teams)
        setInstallStatus(data.installStatus || {})
      }
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const resetDialogState = useCallback(() => {
    setFormData(defaultFormData)
    setRegistrationMode('preset')
    setStep(1)
    setSelectedPreset(null)
    setJsonInput('')
    setJsonError(null)
    setParsedServers([])
    setTestResult(null)
  }, [])

  const openCreateDialog = useCallback(() => {
    setDialogMode('create')
    setEditingId(null)
    resetDialogState()
    setDialogOpen(true)
  }, [resetDialogState])

  const openEditDialog = useCallback((server: MCPServer) => {
    setDialogMode('edit')
    setEditingId(server.id)
    setFormData({
      name: server.name,
      type: server.type || 'subprocess',
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url || '',
      teams: server.teams,
      isGlobal: server.is_global,
    })
    setRegistrationMode('manual')
    setStep(2)
    setSelectedPreset(null)
    setTestResult(null)
    setDialogOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!formData.name) return
    if (formData.type === 'subprocess' && !formData.command) return
    if (formData.type === 'http' && !formData.url) return

    setSaving(true)
    try {
      const apiUrl = dialogMode === 'create' ? '/api/admin/mcp' : `/api/admin/mcp/${editingId}`
      const method = dialogMode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(apiUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          command: formData.type === 'subprocess' ? formData.command : '',
          args: formData.type === 'subprocess' ? formData.args : [],
          env: formData.env,
          url: formData.type === 'http' ? formData.url : null,
          teams: formData.teams,
          is_global: formData.isGlobal,
        }),
      })

      if (res.ok) {
        setDialogOpen(false)
        fetchServers()
      }
    } catch (error) {
      console.error('Failed to save MCP server:', error)
    } finally {
      setSaving(false)
    }
  }, [dialogMode, editingId, formData, fetchServers])

  const handleDelete = useCallback(async () => {
    if (!deletingServer) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/mcp/${deletingServer.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteOpen(false)
        fetchServers()
      }
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    } finally {
      setDeleting(false)
    }
  }, [deletingServer, fetchServers])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/admin/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          command: formData.command,
          args: formData.args,
          env: formData.env,
          url: formData.url,
        }),
      })

      const data = await res.json()
      setTestResult(data)
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setTesting(false)
    }
  }, [formData])

  return {
    // Data
    servers,
    teams,
    installStatus,
    loading,

    // Dialog state
    dialogOpen,
    setDialogOpen,
    dialogMode,
    registrationMode,
    setRegistrationMode,
    step,
    setStep,
    editingId,
    formData,
    setFormData,
    saving,
    selectedPreset,
    setSelectedPreset,

    // JSON import
    jsonInput,
    setJsonInput,
    jsonError,
    setJsonError,
    parsedServers,
    setParsedServers,

    // Test
    testing,
    testResult,
    setTestResult,

    // Delete
    deleteOpen,
    setDeleteOpen,
    deletingServer,
    setDeletingServer,
    deleting,

    // Status dialog
    statusDialogOpen,
    setStatusDialogOpen,
    statusServer,
    setStatusServer,

    // Copy
    copiedCommand,
    setCopiedCommand,

    // Actions
    fetchServers,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
    handleTest,
  }
}
