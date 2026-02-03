'use client'

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

import { useMCPState } from './use-mcp-state'
import { MCPTable, getInstallCommand } from './mcp-table'
import { MCPDialog } from './mcp-dialog'
import { StatusDialog } from './status-dialog'

export default function MCPPage() {
  const {
    servers,
    teams,
    installStatus,
    loading,
    dialogOpen,
    setDialogOpen,
    dialogMode,
    registrationMode,
    setRegistrationMode,
    step,
    setStep,
    formData,
    setFormData,
    saving,
    selectedPreset,
    setSelectedPreset,
    jsonInput,
    setJsonInput,
    jsonError,
    setJsonError,
    parsedServers,
    setParsedServers,
    testing,
    testResult,
    deleteOpen,
    setDeleteOpen,
    deletingServer,
    setDeletingServer,
    deleting,
    statusDialogOpen,
    setStatusDialogOpen,
    statusServer,
    setStatusServer,
    copiedCommand,
    setCopiedCommand,
    fetchServers,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
    handleTest,
  } = useMCPState()

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  async function copyInstallCommand(server: Parameters<typeof getInstallCommand>[0]) {
    const command = getInstallCommand(server)
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(server.id)
      setTimeout(() => setCopiedCommand(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground">
            Manage MCP servers that sync to team members on claude execution
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Server
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MCPTable
            servers={servers}
            installStatus={installStatus}
            loading={loading}
            onEdit={openEditDialog}
            onDelete={(server) => { setDeletingServer(server); setDeleteOpen(true) }}
            onShowStatus={(server) => { setStatusServer(server); setStatusDialogOpen(true) }}
            onCopyCommand={copyInstallCommand}
            copiedCommand={copiedCommand}
          />

          <p className="text-xs text-muted-foreground mt-4">
            Changes sync to team members on their next claude execution
          </p>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <MCPDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        step={step}
        setStep={setStep}
        registrationMode={registrationMode}
        setRegistrationMode={setRegistrationMode}
        formData={formData}
        setFormData={setFormData}
        selectedPreset={selectedPreset}
        setSelectedPreset={setSelectedPreset}
        teams={teams}
        onSave={handleSave}
        saving={saving}
        onTest={handleTest}
        testing={testing}
        testResult={testResult}
        jsonInput={jsonInput}
        setJsonInput={setJsonInput}
        jsonError={jsonError}
        setJsonError={setJsonError}
        parsedServers={parsedServers}
        setParsedServers={setParsedServers}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MCP Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingServer?.name}&quot;? This action cannot be undone.
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
      <StatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        server={statusServer}
        installStatus={installStatus}
        onCopyCommand={copyInstallCommand}
        copiedCommand={copiedCommand}
      />
    </div>
  )
}
