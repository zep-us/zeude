// Shared types for Claude Code vs Codex source comparison analytics.
// Used by usage API route, admin analytics page, and comparison chart components.

export interface SourceBreakdown {
  source: string
  inputTokens: number
  outputTokens: number
  cost: number
  requestCount: number
}

export interface SourceTrendPoint {
  date: string
  claude_inputTokens: number
  claude_outputTokens: number
  claude_cost: number
  codex_inputTokens: number
  codex_outputTokens: number
  codex_cost: number
}

export interface UserSourceUsage {
  userId: string
  userName: string
  claude_inputTokens: number
  claude_outputTokens: number
  claude_cost: number
  claude_requestCount: number
  codex_inputTokens: number
  codex_outputTokens: number
  codex_cost: number
  codex_requestCount: number
}
