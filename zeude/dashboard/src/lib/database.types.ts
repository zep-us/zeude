// Generated types for Supabase database
// Run `npx supabase gen types typescript` to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'member'
export type UserStatus = 'active' | 'inactive'
export type MCPServerStatus = 'active' | 'inactive'

export interface Database {
  public: {
    Tables: {
      zeude_users: {
        Row: {
          id: string
          email: string
          name: string | null
          agent_key: string
          team: string
          role: UserRole
          status: UserStatus
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          agent_key: string
          team?: string
          role?: UserRole
          status?: UserStatus
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          agent_key?: string
          team?: string
          role?: UserRole
          status?: UserStatus
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      zeude_one_time_tokens: {
        Row: {
          id: string
          token: string
          user_id: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          token: string
          user_id: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          token?: string
          user_id?: string
          expires_at?: string
          created_at?: string
        }
      }
      zeude_sessions: {
        Row: {
          id: string
          token: string
          user_id: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          token: string
          user_id: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          token?: string
          user_id?: string
          expires_at?: string
          created_at?: string
        }
      }
      zeude_invites: {
        Row: {
          id: string
          token: string
          team: string
          role: UserRole
          created_by: string | null
          expires_at: string
          used_at: string | null
          used_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          token: string
          team: string
          role?: UserRole
          created_by?: string | null
          expires_at: string
          used_at?: string | null
          used_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          token?: string
          team?: string
          role?: UserRole
          created_by?: string | null
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
          created_at?: string
        }
      }
      zeude_mcp_servers: {
        Row: {
          id: string
          name: string
          command: string
          args: string[]
          env: Record<string, string>
          teams: string[]
          is_global: boolean
          status: MCPServerStatus
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          command: string
          args?: string[]
          env?: Record<string, string>
          teams?: string[]
          is_global?: boolean
          status?: MCPServerStatus
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          command?: string
          args?: string[]
          env?: Record<string, string>
          teams?: string[]
          is_global?: boolean
          status?: MCPServerStatus
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {}
    Functions: {
      cleanup_expired_tokens: {
        Args: Record<string, never>
        Returns: undefined
      }
    }
    Enums: {}
  }
}

// Convenience types
export type User = Database['public']['Tables']['zeude_users']['Row']
export type NewUser = Database['public']['Tables']['zeude_users']['Insert']
export type UpdateUser = Database['public']['Tables']['zeude_users']['Update']
export type OneTimeToken = Database['public']['Tables']['zeude_one_time_tokens']['Row']
export type Session = Database['public']['Tables']['zeude_sessions']['Row']
export type Invite = Database['public']['Tables']['zeude_invites']['Row']
export type NewInvite = Database['public']['Tables']['zeude_invites']['Insert']
export type MCPServer = Database['public']['Tables']['zeude_mcp_servers']['Row']
export type NewMCPServer = Database['public']['Tables']['zeude_mcp_servers']['Insert']
export type UpdateMCPServer = Database['public']['Tables']['zeude_mcp_servers']['Update']

// Skills types
export type SkillStatus = 'active' | 'inactive'

export interface Skill {
  id: string
  name: string
  slug: string
  description: string | null
  content: string
  teams: string[]
  is_global: boolean
  status: SkillStatus
  created_by: string | null
  created_at: string
  updated_at: string
  // Skill hint fields
  keywords: string[] // Deprecated: use primary_keywords/secondary_keywords
  primary_keywords: string[] // High-confidence keywords (trigger alone)
  secondary_keywords: string[] // Lower-confidence keywords (need 2+ matches)
  hint: string | null // Guidance for Claude when skill is suggested
  is_general: boolean // Always show in skill hints
  is_command: boolean // Exclude from skill-rules if true
}

export interface NewSkill {
  name: string
  slug: string
  description?: string | null
  content: string
  teams?: string[]
  is_global?: boolean
  status?: SkillStatus
  created_by?: string | null
}

export interface UpdateSkill {
  name?: string
  slug?: string
  description?: string | null
  content?: string
  teams?: string[]
  is_global?: boolean
  status?: SkillStatus
}

// Hooks types
export type HookStatus = 'active' | 'inactive'
export type HookEvent = 'UserPromptSubmit' | 'Stop' | 'PreToolUse' | 'PostToolUse' | 'Notification' | 'SubagentStop'
export type HookScriptType = 'bash' | 'python' | 'node'

export interface Hook {
  id: string
  name: string
  event: HookEvent
  description: string | null
  script_content: string
  script_type: HookScriptType
  env: Record<string, string>
  teams: string[]
  is_global: boolean
  status: HookStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface NewHook {
  name: string
  event: HookEvent
  description?: string | null
  script_content: string
  script_type?: HookScriptType
  env?: Record<string, string>
  teams?: string[]
  is_global?: boolean
  status?: HookStatus
  created_by?: string | null
}

export interface UpdateHook {
  name?: string
  event?: HookEvent
  description?: string | null
  script_content?: string
  script_type?: HookScriptType
  env?: Record<string, string>
  teams?: string[]
  is_global?: boolean
  status?: HookStatus
}
