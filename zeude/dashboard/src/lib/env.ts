import { z } from 'zod'

const isProduction = process.env.NODE_ENV === 'production'

const envSchema = z.object({
  // Supabase — strict in production, optional in development (SKIP_AUTH=true bypasses auth)
  SUPABASE_URL: isProduction ? z.string().url('SUPABASE_URL must be a valid URL') : z.string().optional().default(''),
  SUPABASE_ANON_KEY: isProduction ? z.string().min(1, 'SUPABASE_ANON_KEY is required') : z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: isProduction ? z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required') : z.string().optional().default(''),

  // ClickHouse
  CLICKHOUSE_URL: z.string().url().optional().default('http://localhost:8123'),
  CLICKHOUSE_USER: z.string().optional().default('default'),
  CLICKHOUSE_PASSWORD: isProduction ? z.string().min(1, 'CLICKHOUSE_PASSWORD is required') : z.string().optional().default('dev'),
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
