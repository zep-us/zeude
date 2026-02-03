import { z } from 'zod'

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // ClickHouse
  CLICKHOUSE_URL: z.string().url().optional().default('http://localhost:8123'),
  CLICKHOUSE_USER: z.string().optional().default('default'),
  CLICKHOUSE_PASSWORD: z.string().optional().default(''),
  CLICKHOUSE_DATABASE: z.string().optional().default('default'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional().default('anthropic/claude-3.5-sonnet'),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    throw new Error('Invalid environment variables. Check the logs above.')
  }

  return result.data
}

// Validate on module load (will fail at startup if env is invalid)
export const env = validateEnv()
