import type { MCPServer } from '@/lib/database.types'
import type { MCPPreset } from '@/lib/mcp-presets'

export interface InstallStatusDetail {
  userId: string
  userName: string
  installed: boolean
  version: string | null
  lastCheckedAt: string | null
}

export interface InstallStatusSummary {
  installed: number
  total: number
  details: InstallStatusDetail[]
}

export type RegistrationMode = 'preset' | 'json' | 'manual'
export type MCPServerTypeOption = 'subprocess' | 'http'

export interface MCPFormData {
  name: string
  type: MCPServerTypeOption
  command: string
  args: string[]
  env: Record<string, string>
  url: string
  teams: string[]
  isGlobal: boolean
}

export const defaultFormData: MCPFormData = {
  name: '',
  type: 'subprocess',
  command: '',
  args: [],
  env: {},
  url: '',
  teams: [],
  isGlobal: false,
}

export interface TestResult {
  success: boolean
  message: string
  details?: string
}

export interface MCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  editingId: string | null
  formData: MCPFormData
  setFormData: (data: MCPFormData) => void
  teams: string[]
  onSave: () => Promise<void>
  saving: boolean
}

export interface MCPTableProps {
  servers: MCPServer[]
  installStatus: Record<string, InstallStatusSummary>
  loading: boolean
  onEdit: (server: MCPServer) => void
  onDelete: (server: MCPServer) => void
  onShowStatus: (server: MCPServer) => void
  onCopyCommand: (server: MCPServer) => void
  copiedCommand: string | null
}
