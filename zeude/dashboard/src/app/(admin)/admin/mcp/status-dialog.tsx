'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, Copy, X } from 'lucide-react'
import type { MCPServer } from '@/lib/database.types'
import type { InstallStatusSummary } from './types'
import { getInstallCommand } from './mcp-table'

interface StatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: MCPServer | null
  installStatus: Record<string, InstallStatusSummary>
  onCopyCommand: (server: MCPServer) => void
  copiedCommand: string | null
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return `${diffDay}d ago`
}

export function StatusDialog({
  open,
  onOpenChange,
  server,
  installStatus,
  onCopyCommand,
  copiedCommand,
}: StatusDialogProps) {
  if (!server) return null

  const status = installStatus[server.id]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Installation Status - {server.name}</DialogTitle>
          <DialogDescription>
            Team member installation status for this MCP server
          </DialogDescription>
        </DialogHeader>

        {status && (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Install Command</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => onCopyCommand(server)}
                >
                  {copiedCommand === server.id ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <code className="text-xs font-mono break-all">
                {getInstallCommand(server)}
              </code>
            </div>

            <div className="divide-y max-h-[300px] overflow-y-auto">
              {status.details.map((detail) => (
                <div key={detail.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    {detail.installed ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">{detail.userName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {detail.installed ? (
                      <>
                        {detail.version && <span>v{detail.version}</span>}
                        <span>{formatRelativeTime(detail.lastCheckedAt)}</span>
                      </>
                    ) : (
                      <span>Not installed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t text-center text-sm text-muted-foreground">
              {status.installed} of {status.total} team members installed
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
