'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Settings, Trash2, Check, Users, Copy } from 'lucide-react'
import type { MCPServer } from '@/lib/database.types'
import { MCP_PRESETS } from '@/lib/mcp-presets'
import type { InstallStatusSummary } from './types'

interface MCPTableProps {
  servers: MCPServer[]
  installStatus: Record<string, InstallStatusSummary>
  loading: boolean
  onEdit: (server: MCPServer) => void
  onDelete: (server: MCPServer) => void
  onShowStatus: (server: MCPServer) => void
  onCopyCommand: (server: MCPServer) => void
  copiedCommand: string | null
}

export function getInstallCommand(server: MCPServer): string {
  if (server.type === 'http') {
    return server.url || '# HTTP MCP server'
  }

  const preset = MCP_PRESETS.find(p =>
    p.command === server.command &&
    server.args.some(arg => p.args.includes(arg))
  )
  if (preset?.installCommand) {
    return preset.installCommand
  }

  if (server.command === 'npx') {
    const packageArg = server.args.find(arg => arg.startsWith('@') || (!arg.startsWith('-') && arg !== '-y'))
    if (packageArg) {
      return `npm install -g ${packageArg}`
    }
  } else if (server.command === 'uvx') {
    const packageArg = server.args.find(arg => !arg.startsWith('-'))
    if (packageArg) {
      return `uv pip install ${packageArg}`
    }
  }

  return `# ${server.command} ${server.args.join(' ')}`
}

export function MCPTable({
  servers,
  installStatus,
  loading,
  onEdit,
  onDelete,
  onShowStatus,
  onCopyCommand,
  copiedCommand,
}: MCPTableProps) {
  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No MCP servers configured. Add your first server to get started.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Command</TableHead>
          <TableHead>Teams</TableHead>
          <TableHead>Installed</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {servers.map((server) => {
          const status = installStatus[server.id]
          return (
            <TableRow key={server.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-1.5">
                  {server.name}
                  {server.type === 'http' && <Badge variant="outline" className="text-xs">HTTP</Badge>}
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm max-w-[200px] truncate" title={server.type === 'http' ? (server.url || '') : server.command}>
                {server.type === 'http' ? (server.url || '-') : server.command}
              </TableCell>
              <TableCell>
                {server.is_global ? (
                  <Badge>All Teams</Badge>
                ) : server.teams.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {server.teams.map((team) => (
                      <Badge key={team} variant="outline">{team}</Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell>
                {status ? (
                  <button
                    onClick={() => onShowStatus(server)}
                    className="flex items-center gap-1.5 text-sm hover:underline"
                    title="View installation details"
                  >
                    <Users className="h-4 w-4" />
                    <span className={status.installed === status.total ? 'text-green-600' : status.installed > 0 ? 'text-yellow-600' : 'text-muted-foreground'}>
                      {status.installed}/{status.total}
                    </span>
                  </button>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={server.status === 'active' ? 'default' : 'secondary'}>
                  {server.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onCopyCommand(server)}
                    title="Copy install command"
                  >
                    {copiedCommand === server.id ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onEdit(server)}
                    title="Edit server"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onDelete(server)}
                    title="Delete server"
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
  )
}
