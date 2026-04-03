import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { MCPServer } from '@/lib/database.types'

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

interface MCPData {
  servers: MCPServer[]
  teams: string[]
  installStatus: Record<string, InstallStatusSummary>
}

async function fetchMCPServers(): Promise<MCPData> {
  const res = await fetch('/api/admin/mcp')
  if (!res.ok) throw new Error('Failed to fetch MCP servers')
  const data = await res.json()
  return {
    servers: data.servers,
    teams: data.teams,
    installStatus: data.installStatus || {},
  }
}

export function useMCPServers() {
  return useQuery({
    queryKey: queryKeys.mcp.all,
    queryFn: fetchMCPServers,
    staleTime: 30_000,
  })
}

export function useSaveMCP() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string | null; data: Record<string, unknown> }) => {
      const url = id ? `/api/admin/mcp/${id}` : '/api/admin/mcp'
      const method = id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to save MCP server')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all })
    },
  })
}

export function useDeleteMCP() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/mcp/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete MCP server')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all })
    },
  })
}

export function useTestMCP() {
  return useMutation({
    mutationFn: async (data: { url?: string; command?: string; args?: string[]; env?: Record<string, string> }) => {
      const res = await fetch('/api/admin/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
  })
}

export type { MCPData, InstallStatusSummary }
