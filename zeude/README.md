# Zeude

Zeude is an enterprise monitoring and configuration management platform for Claude Code. It provides telemetry collection, prompt analytics, centralized MCP server management, and remote hook deployment.

## Features

- **OpenTelemetry Integration**: Collect and analyze Claude Code usage metrics
- **Prompt Analytics**: Track and analyze all prompts sent to Claude Code
- **MCP Server Management**: Centrally manage MCP servers across your team
- **Remote Hook Deployment**: Deploy Claude Code hooks from the dashboard
- **Auto-Update**: CLI binary automatically updates when new versions are available
- **Team Management**: Organize users into teams with shared configurations

## Quick Install

```bash
curl -fsSL https://your-dashboard-url/releases/install.sh | ZEUDE_AGENT_KEY=zd_xxx bash
```

Replace `zd_xxx` with your agent key from the dashboard.

## Manual Installation

### Prerequisites

- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
- macOS (Intel/Apple Silicon) or Linux (x86_64/arm64)

### Steps

1. **Download the installer**
   ```bash
   curl -fsSL https://your-dashboard-url/releases/install.sh -o install.sh
   chmod +x install.sh
   ```

2. **Run with your agent key**
   ```bash
   ZEUDE_AGENT_KEY=zd_your_key ./install.sh
   ```

3. **Restart your shell**
   ```bash
   source ~/.zshrc  # or ~/.bashrc
   ```

4. **Verify installation**
   ```bash
   zeude doctor
   ```

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  claude (shim)  │────▶│  real claude     │────▶│  Claude API     │
│  ~/.zeude/bin   │     │  /usr/local/bin  │     │                 │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         │ on startup
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Sync Config    │────▶│  Zeude Dashboard │────▶│  Supabase       │
│  MCP + Hooks    │     │  Dashboard        │     │  ClickHouse     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| `~/.zeude/bin/claude` | Shim binary that wraps the real Claude CLI |
| `~/.zeude/bin/zeude` | Doctor/diagnostic utility |
| `~/.zeude/credentials` | Agent key for authentication |
| `~/.zeude/config` | Endpoint and dashboard URL configuration |
| `~/.claude.json` | MCP servers synced from dashboard |
| `~/.claude/hooks/` | Hook scripts installed from dashboard |
| `~/.claude/settings.json` | Hook registrations for Claude Code |

### Sync Process

When you run `claude`, the shim:

1. Calls the dashboard API to fetch your team's configuration
2. Syncs MCP servers to `~/.claude.json`
3. Installs hooks to `~/.claude/hooks/{event}/`
4. Registers hooks in `~/.claude/settings.json`
5. Executes the real Claude CLI

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZEUDE_AGENT_KEY` | Your agent key (set during install) | - |
| `ZEUDE_DASHBOARD_URL` | Dashboard URL | `https://your-dashboard-url` |
| `ZEUDE_DEBUG` | Enable debug logging | `0` |

### Files

**~/.zeude/credentials**
```
agent_key=zd_your_agent_key
```

**~/.zeude/config**
```
endpoint=https://your-otel-collector-url/
dashboard_url=https://your-dashboard-url
```

## Dashboard Features

### MCP Server Management

Add, edit, and remove MCP servers from the dashboard. Servers are automatically synced to all team members' machines.

- Global servers: Available to all users
- Team servers: Available only to specific teams

### Hook Management

Deploy Claude Code hooks remotely:

- **UserPromptSubmit**: Track all prompts sent to Claude
- **Stop**: Actions when Claude stops
- **PreToolUse/PostToolUse**: Before/after tool execution
- **Notification**: Custom notifications

Hooks support Bash, Python, and Node.js scripts.

### Prompt Analytics

The built-in Prompt Logger hook captures all prompts and stores them in ClickHouse for analysis. Use the AI chatbot to query your prompt history.

## Commands

### /zeude

Opens the Zeude dashboard in your browser with automatic authentication:

```
> /zeude
```

### zeude doctor

Diagnose installation issues:

```bash
zeude doctor
```

## Auto-Update

The CLI binary automatically checks for updates every 24 hours and self-updates when a new version is available. No action required.

To check the current version:
```bash
zeude doctor
```

## Uninstall

To completely remove Zeude from your system:

```bash
curl -fsSL https://your-dashboard-url/releases/uninstall.sh | bash
```

This will:
- Remove the Zeude shim binary (`~/.zeude/`)
- Remove Zeude-installed hooks (`~/.claude/hooks/`)
- Clean up MCP server configurations (`~/.claude.json`)
- Remove the `/zeude` skill
- Remove PATH configuration from shell rc files

## Troubleshooting

### Hooks not working

1. Verify hooks are installed:
   ```bash
   ls -la ~/.claude/hooks/
   ```

2. Check settings.json registration:
   ```bash
   cat ~/.claude/settings.json | jq '.hooks'
   ```

3. Enable debug logging:
   ```bash
   ZEUDE_DEBUG=1 claude
   ```

### MCP servers not syncing

1. Check agent key:
   ```bash
   cat ~/.zeude/credentials
   ```

2. Test API connectivity:
   ```bash
   curl -H "Authorization: Bearer $(grep agent_key ~/.zeude/credentials | cut -d= -f2)" \
     https://your-dashboard-url/api/config/_
   ```

3. Check cache:
   ```bash
   cat ~/.zeude/config-cache.json | jq '.config.serverCount'
   ```

### Real Claude not found

The shim couldn't find the original Claude CLI. Ensure it's installed:

```bash
npm install -g @anthropic-ai/claude-code
which claude
```

## Development

### Local Dashboard

```bash
cd dashboard
npm install
npm run dev
```

### Build Binaries

```bash
# All platforms
docker build -t zeude-builder .

# Extract binaries
docker cp $(docker create zeude-builder):/app/public/releases ./releases
```

### Environment Variables (Local Dev)

```bash
# Skip auth for local testing
SKIP_AUTH=true
MOCK_EMAIL=your@email.com
```

## Security

- Agent keys are stored with 0600 permissions
- All API calls use Bearer token authentication
- Hook scripts are sandboxed with injected environment variables
- No credentials are stored in plain text logs

## Support

- Issues: https://github.com/ZEP-Inc/zeude/issues
- Dashboard: https://your-dashboard-url
