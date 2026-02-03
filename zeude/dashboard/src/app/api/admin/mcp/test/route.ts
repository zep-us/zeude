import { getSession } from '@/lib/session'
import { spawn } from 'child_process'

// Maximum output size to prevent DoS (50KB)
const MAX_OUTPUT_SIZE = 50 * 1024

// Allowed environment variable keys for MCP servers
const ALLOWED_ENV_KEYS = [
  'DATABASE_URL', 'GITHUB_TOKEN', 'NOTION_API_KEY', 'SLACK_BOT_TOKEN',
  'SLACK_TEAM_ID', 'BRAVE_API_KEY', 'API_KEY', 'API_SECRET', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION',
]

// Dangerous flags that enable code execution
const DANGEROUS_FLAGS = ['-e', '--eval', '-c', '--command', '-i', '--interactive', '--inspect', '--inspect-brk']

// POST: Test MCP server connection
export async function POST(req: Request) {
  try {
    const session = await getSession()

    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { command, args = [], env = {} } = body

    if (!command || typeof command !== 'string') {
      return Response.json({ error: 'Command is required' }, { status: 400 })
    }

    // Security: Only allow npx and uvx commands (removed node/python to prevent arbitrary code execution)
    if (!['npx', 'uvx'].includes(command)) {
      return Response.json({ error: 'Invalid command. Only npx and uvx are allowed.' }, { status: 400 })
    }

    // Security: Validate args don't contain shell injection
    const invalidArg = args.find((arg: string) =>
      typeof arg !== 'string' || /[;&|`$(){}[\]<>\n\r]/.test(arg)
    )
    if (invalidArg) {
      return Response.json({ error: 'Invalid argument detected' }, { status: 400 })
    }

    // Security: Block dangerous flags that enable inline code execution
    const dangerousArg = args.find((arg: string) =>
      DANGEROUS_FLAGS.includes(arg.toLowerCase())
    )
    if (dangerousArg) {
      return Response.json({ error: 'Inline code execution flags are not allowed' }, { status: 400 })
    }

    // Security: Sanitize environment variables - only allow whitelisted keys
    const sanitizedEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (ALLOWED_ENV_KEYS.includes(key) && typeof value === 'string') {
        sanitizedEnv[key] = value
      }
    }

    const result = await testMCPServer(command, args, sanitizedEnv)
    return Response.json(result)
  } catch (err) {
    console.error('MCP test error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface TestResult {
  success: boolean
  message: string
  details?: string
}

// Sanitize output to remove potentially sensitive information
function sanitizeOutput(output: string): string {
  // Remove potential secrets, tokens, paths with user info
  return output
    .replace(/([A-Za-z0-9_]+_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[=:]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\/Users\/[^/\s]+/g, '/Users/[REDACTED]')
    .replace(/\/home\/[^/\s]+/g, '/home/[REDACTED]')
    .slice(0, MAX_OUTPUT_SIZE) // Enforce max size
}

async function testMCPServer(
  command: string,
  args: string[],
  env: Record<string, string>
): Promise<TestResult> {
  return new Promise((resolve) => {
    // Add --help or similar to just test if the command can run
    const testArgs = [...args]

    // For npx/uvx, we test if the package exists by running with --help
    // But this might take too long, so we just check if command can start
    const timeout = 10000 // 10 second timeout

    // Security: Only pass PATH and HOME from process.env, plus sanitized user env
    const childEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: process.env.NODE_ENV,
      ...env,
    }

    const child = spawn(command, testArgs, {
      env: childEnv,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      // Limit output size to prevent DoS
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += data.toString().slice(0, MAX_OUTPUT_SIZE - stdout.length)
      }
    })

    child.stderr?.on('data', (data) => {
      // Limit output size to prevent DoS
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += data.toString().slice(0, MAX_OUTPUT_SIZE - stderr.length)
      }
    })

    // Set a manual timeout to kill the process
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        success: true,
        message: 'Server started successfully (terminated after timeout)',
        details: 'The MCP server process started without errors. It was terminated after 10 seconds.',
      })
    }, timeout)

    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        success: false,
        message: `Failed to start: ${error.message}`,
        details: sanitizeOutput(stderr || stdout),
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)

      // For npx packages, exit code 0 or null (if killed) indicates success
      if (code === 0 || code === null) {
        resolve({
          success: true,
          message: 'Server started successfully',
          details: sanitizeOutput(stdout || stderr || 'Process completed without output'),
        })
      } else {
        // Check for common errors
        const output = stderr || stdout

        if (output.includes('ENOENT') || output.includes('not found')) {
          resolve({
            success: false,
            message: 'Command not found. Make sure the package is installed.',
            details: sanitizeOutput(output),
          })
        } else if (output.includes('ECONNREFUSED') || output.includes('connection refused')) {
          resolve({
            success: false,
            message: 'Connection refused. Check your environment variables.',
            details: sanitizeOutput(output),
          })
        } else if (output.includes('authentication') || output.includes('unauthorized')) {
          resolve({
            success: false,
            message: 'Authentication failed. Check your credentials.',
            details: sanitizeOutput(output),
          })
        } else {
          resolve({
            success: false,
            message: `Process exited with code ${code}`,
            details: sanitizeOutput(output),
          })
        }
      }
    })

    // Send initial message to start MCP handshake (optional)
    // MCP servers expect JSON-RPC messages, but we just want to test if they start
    setTimeout(() => {
      child.stdin?.end()
    }, 100)
  })
}
