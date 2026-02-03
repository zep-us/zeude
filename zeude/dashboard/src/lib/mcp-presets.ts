// MCP Server presets for easy registration
// These are popular MCP servers with pre-configured settings

export interface MCPPreset {
  id: string
  name: string
  icon: string
  description: string
  command: string
  args: string[]
  env: Record<string, string>
  envPlaceholders?: Record<string, string>
  installCommand?: string
}

export const MCP_PRESETS: MCPPreset[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    icon: '🐘',
    description: 'Query PostgreSQL databases',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { DATABASE_URL: '' },
    envPlaceholders: { DATABASE_URL: 'postgres://user:pass@host/db' },
    installCommand: 'npm install -g @modelcontextprotocol/server-postgres',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    icon: '📁',
    description: 'Read and write local files',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
    env: {},
    installCommand: 'npm install -g @modelcontextprotocol/server-filesystem',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '🔗',
    description: 'Interact with GitHub repositories',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: '' },
    envPlaceholders: { GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx' },
    installCommand: 'npm install -g @modelcontextprotocol/server-github',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    icon: '🌐',
    description: 'Fetch web content',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    env: {},
    installCommand: 'uv pip install mcp-server-fetch',
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '📊',
    description: 'Access Notion databases and pages',
    command: 'npx',
    args: ['-y', '@notionhq/mcp-server'],
    env: { NOTION_API_KEY: '' },
    envPlaceholders: { NOTION_API_KEY: 'secret_xxxxxxxxxxxx' },
    installCommand: 'npm install -g @notionhq/mcp-server',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    description: 'Send and read Slack messages',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-slack'],
    env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    envPlaceholders: { SLACK_BOT_TOKEN: 'xoxb-xxxxxxxxxxxx', SLACK_TEAM_ID: 'T0XXXXXXX' },
    installCommand: 'npm install -g @anthropic/mcp-server-slack',
  },
  {
    id: 'memory',
    name: 'Memory',
    icon: '🧠',
    description: 'Persistent memory storage',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    installCommand: 'npm install -g @modelcontextprotocol/server-memory',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    icon: '🦁',
    description: 'Search the web with Brave',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    envPlaceholders: { BRAVE_API_KEY: 'BSAxxxxxxxxxxxx' },
    installCommand: 'npm install -g @modelcontextprotocol/server-brave-search',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    icon: '🎭',
    description: 'Browser automation with Puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    env: {},
    installCommand: 'npm install -g @modelcontextprotocol/server-puppeteer',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    icon: '💾',
    description: 'Query SQLite databases',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', '/path/to/database.db'],
    env: {},
    installCommand: 'uv pip install mcp-server-sqlite',
  },
]

// Helper to get a preset by ID
export function getPresetById(id: string): MCPPreset | undefined {
  return MCP_PRESETS.find(preset => preset.id === id)
}

// Helper to parse claude.json MCP server config
export interface ClaudeJsonMCPServer {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface ClaudeJsonConfig {
  mcpServers?: Record<string, ClaudeJsonMCPServer>
}

export function parseClaudeJson(jsonStr: string): { servers: { name: string; config: ClaudeJsonMCPServer }[]; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr)

    // Handle full claude.json format
    if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      const servers = Object.entries(parsed.mcpServers).map(([name, config]) => ({
        name,
        config: config as ClaudeJsonMCPServer,
      }))
      return { servers }
    }

    // Handle just the mcpServers object directly
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Check if it looks like an MCP server config (has command property)
      const firstValue = Object.values(parsed)[0] as Record<string, unknown> | undefined
      if (firstValue && typeof firstValue === 'object' && 'command' in firstValue) {
        const servers = Object.entries(parsed).map(([name, config]) => ({
          name,
          config: config as ClaudeJsonMCPServer,
        }))
        return { servers }
      }
    }

    return { servers: [], error: 'Invalid format. Expected claude.json with mcpServers or MCP server config object.' }
  } catch (e) {
    return { servers: [], error: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}` }
  }
}
