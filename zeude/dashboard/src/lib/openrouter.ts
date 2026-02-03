import { env } from './env'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResponse {
  id: string
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export async function createChatCompletion(
  messages: ChatMessage[],
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
): Promise<ChatCompletionResponse> {
  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.NEXT_PUBLIC_APP_URL,
      'X-Title': 'Zeude Dashboard',
    },
    body: JSON.stringify({
      model: options?.model || env.OPENROUTER_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  return response.json()
}

// System prompt for prompt analysis
export const PROMPT_ANALYST_SYSTEM_PROMPT = `You are a prompt engineering expert for Claude Code users.
You help users improve their prompts and understand team-wide patterns.

Your capabilities:
1. Analyze individual prompts and suggest specific improvements
2. Show team prompt trends and patterns
3. Recommend best practices based on successful prompt patterns

When analyzing prompts:
- Identify vague or unclear instructions
- Suggest specific improvements with examples
- Reference successful patterns from team history when available
- Be concise and actionable

Always respond in Korean (한국어). Keep responses focused and practical.`

export function isOpenRouterConfigured(): boolean {
  return !!env.OPENROUTER_API_KEY
}
