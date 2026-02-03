import { randomUUID } from 'crypto'

// Valid prompt types for classification
export const PROMPT_TYPES = ['natural', 'skill', 'command', 'agent', 'mcp_tool'] as const
export type PromptType = (typeof PROMPT_TYPES)[number]

// Built-in CLI commands (not tracked as skills)
export const BUILTIN_COMMANDS = [
  'help', 'clear', 'compact', 'config', 'cost', 'doctor',
  'init', 'login', 'logout', 'memory', 'model', 'permissions',
  'review', 'status', 'tasks', 'vim'
] as const

// Agent key format: zd_ followed by 64 hex characters
export const AGENT_KEY_PATTERN = /^zd_[a-f0-9]{64}$/

// Validate UUID format (RFC 4122)
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// Generate a new UUID (server-side fallback)
export function generateUUID(): string {
  return randomUUID()
}

// Detect prompt type from text (e.g., /skill-name, /command)
// Pattern: starts with / followed by alphanumeric, dashes, underscores, or colons
const SKILL_PATTERN = /^\/([a-zA-Z0-9_:-]+)/

export function detectPromptType(prompt: string): { promptType: PromptType; invokedName: string } {
  const trimmed = prompt.trim()
  const match = trimmed.match(SKILL_PATTERN)

  if (match) {
    const name = match[1]
    // Skills with colons (e.g., /bmad:workflow) or specific prefixes
    if (name.includes(':')) {
      return { promptType: 'skill', invokedName: name }
    }
    // Built-in commands (help, clear, etc.) - these are not tracked as skills
    if (BUILTIN_COMMANDS.includes(name.toLowerCase() as typeof BUILTIN_COMMANDS[number])) {
      return { promptType: 'command', invokedName: name }
    }
    // Assume other /xxx patterns are skills
    return { promptType: 'skill', invokedName: name }
  }

  return { promptType: 'natural', invokedName: '' }
}

// Validate prompt type
export function isValidPromptType(type: string): type is PromptType {
  return PROMPT_TYPES.includes(type as PromptType)
}
