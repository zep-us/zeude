'use client'

import { useState, useCallback } from 'react'
import type { MCPServer } from '@/lib/database.types'
import type { MCPPreset } from '@/lib/mcp-presets'
import { useMCPServers, useSaveMCP, useDeleteMCP, useTestMCP } from '@/hooks/use-mcp'
import {
  type MCPFormData,
  type RegistrationMode,
  type TestResult,
  defaultFormData,
} from './types'

export function useMCPState() {
  const { data, isLoading: loading, isError, refetch } = useMCPServers()
  const saveMutation = useSaveMCP()
  const deleteMutation = useDeleteMCP()
  const testMutation = useTestMCP()

  const servers = data?.servers ?? []
  const teams = data?.teams ?? []
  const installStatus = data?.installStatus ?? {}

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('preset')
  const [step, setStep] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<MCPFormData>(defaultFormData)

  // Preset selection
  const [selectedPreset, setSelectedPreset] = useState<MCPPreset | null>(null)

  // JSON import
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [parsedServers, setParsedServers] = useState<{ name: string; config: { url?: string; command?: string; args?: string[]; env?: Record<string, string> } }[]>([])

  // Connection test state
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingServer, setDeletingServer] = useState<MCPServer | null>(null)

  // Install status dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusServer, setStatusServer] = useState<MCPServer | null>(null)

  // Copy state
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

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
      url: server.url || '',
      command: server.command,
      args: server.args,
      env: server.env,
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
    const hasUrl = formData.url.trim() !== ''
    const hasCommand = formData.command.trim() !== ''
    if (!formData.name || (!hasUrl && !hasCommand)) return

    try {
      await saveMutation.mutateAsync({
        id: dialogMode === 'edit' ? editingId : null,
        data: {
          name: formData.name,
          url: hasUrl ? formData.url : null,
          command: hasCommand ? formData.command : null,
          args: hasUrl ? [] : formData.args,
          env: hasUrl ? {} : formData.env,
          teams: formData.teams,
          is_global: formData.isGlobal,
        },
      })
      setDialogOpen(false)
    } catch (error) {
      console.error('Failed to save MCP server:', error)
    }
  }, [dialogMode, editingId, formData, saveMutation])

  const handleDelete = useCallback(async () => {
    if (!deletingServer) return

    try {
      await deleteMutation.mutateAsync(deletingServer.id)
      setDeleteOpen(false)
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    }
  }, [deletingServer, deleteMutation])

  const handleTest = useCallback(async () => {
    setTestResult(null)

    try {
      const result = await testMutation.mutateAsync({
        url: formData.url || undefined,
        command: formData.command || undefined,
        args: formData.args,
        env: formData.env,
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [formData, testMutation])

  return {
    // Data
    servers,
    teams,
    installStatus,
    loading,
    isError,
    refetch,

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
    saving: saveMutation.isPending,
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
    testing: testMutation.isPending,
    testResult,
    setTestResult,

    // Delete
    deleteOpen,
    setDeleteOpen,
    deletingServer,
    setDeletingServer,
    deleting: deleteMutation.isPending,

    // Status dialog
    statusDialogOpen,
    setStatusDialogOpen,
    statusServer,
    setStatusServer,

    // Copy
    copiedCommand,
    setCopiedCommand,

    // Actions
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
    handleTest,
  }
}
