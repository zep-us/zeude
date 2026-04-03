# Zeude

**Open-source monitoring and configuration platform for AI coding assistants.**

Zeude gives engineering teams visibility into how Claude Code and OpenAI Codex are used — prompt analytics, cost tracking, skill distribution, and centralized configuration — all from a single self-hosted dashboard.

## Why Zeude?

- **Understand usage** — See who's using what, how much it costs, and which prompts work best
- **Distribute knowledge** — Push skills, MCP servers, hooks, and agent profiles to your whole team
- **Support multiple tools** — Monitor both Claude Code and OpenAI Codex from one place
- **Own your data** — Self-hosted with Supabase + ClickHouse, no data leaves your infrastructure

## Features

| Feature | Description |
|---------|-------------|
| **Prompt Analytics** | Track all prompts with token usage, cost, and model breakdown |
| **Leaderboard** | Weekly usage rankings with cohort-based grouping |
| **Skill Management** | Multi-file skills with keyword-based suggestion and per-user preferences |
| **Agent Profiles** | Centrally manage and distribute agent configurations |
| **MCP Server Sync** | Push MCP server configs to all team members automatically |
| **Remote Hooks** | Deploy Claude Code hooks (Bash/Python/Node.js) from the dashboard |
| **Codex Integration** | Unified telemetry for OpenAI Codex alongside Claude Code |
| **Auto-Update** | CLI shim self-updates every 24 hours |
| **Team Management** | Organize users into teams with role-based access |

## Architecture

```
Developer Machine                          Self-Hosted Infrastructure
┌──────────────────────┐                   ┌────────────────────────────┐
│                      │                   │                            │
│  claude/codex (shim) │──── on startup ──▶│  Zeude Dashboard (Next.js) │
│  ~/.zeude/bin/       │   sync config     │  ├── Supabase (users, config)
│         │            │                   │  └── ClickHouse (telemetry)│
│         ▼            │                   │                            │
│  real claude/codex   │                   │  OTel Collector            │
│  (original binary)   │──── telemetry ──▶│  (receives spans & logs)   │
│                      │                   │                            │
└──────────────────────┘                   └────────────────────────────┘
```

### How the shim works

When you run `claude` (or `codex`), the Zeude shim:

1. Fetches your team's config from the dashboard API
2. Syncs MCP servers → `~/.claude.json`
3. Installs hooks → `~/.claude/hooks/`
4. Syncs skills → `~/.claude/skills/` (or `~/.codex/skills/`)
5. Installs agent profiles → `~/.claude/agents/`
6. Injects OTel telemetry environment variables
7. `exec`s the real CLI binary (replaces the shim process)

## Quick Start

### 1. Deploy the dashboard

```bash
cd dashboard
cp .env.example .env.local   # configure Supabase + ClickHouse URLs
npm install
npm run dev
```

### 2. Install the CLI shim

```bash
curl -fsSL https://YOUR_DASHBOARD_URL/releases/install.sh | ZEUDE_AGENT_KEY=zd_xxx bash
```

### 3. Verify

```bash
zeude doctor
```

## Project Structure

```
zeude/
├── cmd/
│   ├── claude/          # Claude Code shim binary
│   ├── codex/           # OpenAI Codex shim binary
│   ├── zeude/           # Doctor/diagnostic CLI
│   └── doctor/          # Health check utility
├── internal/
│   ├── mcpconfig/       # Config sync engine (skills, hooks, MCP, agents)
│   ├── resolver/        # Binary resolution with fork-bomb prevention
│   ├── autoupdate/      # Self-update mechanism
│   ├── identity/        # Cross-tool user identity resolution
│   ├── config/          # Endpoint configuration
│   └── otelenv/         # OTel environment variable injection
├── dashboard/
│   ├── src/app/         # Next.js App Router pages & API routes
│   ├── clickhouse/      # ClickHouse schema, migrations, and tests
│   └── supabase/        # Supabase migrations
├── scripts/             # Build and install scripts
├── deployments/         # OTel Collector config
└── Dockerfile           # Multi-platform binary builder
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZEUDE_AGENT_KEY` | Agent key for authentication | — |
| `ZEUDE_DASHBOARD_URL` | Dashboard URL | `https://your-dashboard-url` |
| `ZEUDE_DEBUG` | Enable debug logging (`1` to enable) | `0` |

### Credential files

```bash
# ~/.zeude/credentials
agent_key=zd_your_agent_key

# ~/.zeude/config
endpoint=https://your-otel-collector-url/
dashboard_url=https://your-dashboard-url
```

## Development

### Dashboard (Next.js)

```bash
cd dashboard
npm install
npm run dev          # http://localhost:3000

# Run tests
npm test             # 202 vitest tests

# Local dev without auth/DB
SKIP_AUTH=true MOCK_API=true npm run dev
```

### Go binaries

```bash
# Run tests
go test ./...

# Build all binaries
docker build -t zeude-builder .
docker cp $(docker create zeude-builder):/app/public/releases ./releases
```

### ClickHouse (local)

```bash
cd dashboard
docker compose -f docker-compose.dev.yaml up -d
# Schema auto-applied from clickhouse/init.sql
```

## Commands

| Command | Description |
|---------|-------------|
| `zeude doctor` | Diagnose installation issues |
| `/zeude` (in Claude Code) | Open dashboard with auto-login |

## Security

- Agent keys stored with `0600` permissions
- All API calls use Bearer token authentication
- Hook scripts run with injected environment variables
- Config sync uses hash-based diffing (no unnecessary writes)
- Path traversal and symlink attack prevention in file sync

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Run tests (`go test ./...` and `cd dashboard && npm test`)
4. Submit a pull request

For bugs and feature requests, please [open an issue](https://github.com/zep-us/zeude/issues).

## License

See [LICENSE](LICENSE) for details.
