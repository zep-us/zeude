# Zeude

<p align="center">
  <strong>Turn Your Organization into AI Natives</strong><br>
  <em>Enterprise Monitoring & Configuration Management Platform for Claude Code</em>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> |
  <a href="#three-layer-architecture">Architecture</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#enterprise">Enterprise</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

---

## The Problem

> *"Even with great AI tools, there's a huge **Intention-Action Gap** due to high learning curves."*

Organizations invest in AI tools like Claude Code, but adoption remains low. Developers don't know what's possible, best practices stay hidden in silos, and there's no systematic way to share knowledge across teams.

**Zeude bridges this gap** through a data-driven ecosystem that measures, delivers, and guides—turning passive tool availability into active organizational capability.

---

## Three-Layer Architecture

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                         ZEUDE ECOSYSTEM                                           ║
║         "Measurement brings visibility, sharing drives adoption"                  ║
╚═══════════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│   1. SENSING            │    │   2. DELIVERY           │    │   3. GUIDANCE           │
│      (Measurement)      │    │      (Deployment)       │    │      (Suggestion)       │
├─────────────────────────┤    ├─────────────────────────┤    ├─────────────────────────┤
│                         │    │                         │    │                         │
│  ┌─────────────────┐    │    │  ┌─────────────────┐    │    │  ┌─────────────────┐    │
│  │  Claude Code    │    │    │  │ Zeude Dashboard │    │    │  │  Claude Code    │    │
│  │  + OTEL Traces  │    │    │  │ (Skill/Hook     │    │    │  │  (User Prompt)  │    │
│  └────────┬────────┘    │    │  │  Management)    │    │    │  └────────┬────────┘    │
│           │             │    │  └────────┬────────┘    │    │           │             │
│           ▼             │    │           │             │    │           ▼             │
│  ┌─────────────────┐    │    │           ▼             │    │  ┌─────────────────┐    │
│  │   ClickHouse    │    │    │  ┌─────────────────┐    │    │  │ UserPromptSubmit│    │
│  │   (Analytics)   │    │    │  │   Zeude Shim    │    │    │  │     Hook        │    │
│  └────────┬────────┘    │    │  │ (Auto-sync on   │    │    │  └────────┬────────┘    │
│           │             │    │  │  Claude start)  │    │    │           │             │
│           ▼             │    │  └────────┬────────┘    │    │           ▼             │
│  ┌─────────────────┐    │    │           │             │    │  ┌─────────────────┐    │
│  │    Dashboard    │    │    │           ▼             │    │  │  Skill Hint     │    │
│  │  (Insights &    │    │    │  ┌─────────────────┐    │    │  │  (Keyword Match)│    │
│  │   Best Practice)│    │    │  │  Local Sync     │    │    │  └────────┬────────┘    │
│  └─────────────────┘    │    │  │  - skills/      │    │    │           │             │
│                         │    │  │  - hooks/       │    │    │           ▼             │
│  "You can't improve     │    │  │  - rules.json   │    │    │  ┌─────────────────┐    │
│   what you don't        │    │  └─────────────────┘    │    │  │ Skill Suggestion│    │
│   measure"              │    │                         │    │  │ "Try /slack!"   │    │
│                         │    │  Syncs latest tools     │    │  └─────────────────┘    │
│                         │    │  automatically          │    │                         │
│                         │    │                         │    │  Right tool, right time │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
           │                              │                              │
           └──────────────────────────────┼──────────────────────────────┘
                                          │
                                          ▼
                    ╔═════════════════════════════════════════╗
                    ║    CYCLE OF CONTINUOUS IMPROVEMENT      ║
                    ║                                         ║
                    ║  Insights ──▶ Skills ──▶ Adoption ──┐   ║
                    ║     ▲                               │   ║
                    ║     └───────── Measurement ◀────────┘   ║
                    ╚═════════════════════════════════════════╝
```

### 1. Sensing (Measurement)

> *"You can't improve what you don't measure"*

- **OpenTelemetry Integration**: Capture Claude Code usage via native OTEL traces
- **ClickHouse Analytics**: High-performance storage for token usage, session data, and patterns
- **Dashboard Insights**: Visualize adoption rates, identify power users, discover best practices

```
Developer Activity ──▶ OTEL Traces ──▶ ClickHouse ──▶ Dashboard Insights
```

### 2. Delivery (Deployment)

> *"Automated deployment removes friction"*

- **Zeude Shim**: Transparent wrapper that syncs configurations on every `claude` invocation
- **Centralized Management**: Define skills, MCP servers, and hooks in the dashboard
- **Zero-Touch Sync**: Teams get the latest tools without manual installation

```
Dashboard ──▶ API ──▶ Zeude Shim ──▶ Local Environment
                         │
                         ├── ~/.claude/hooks/
                         ├── ~/.claude/skills/
                         └── ~/.claude/skill-rules.json
```

### 3. Guidance (Suggestion)

> *"The right tool at the right moment"*

- **UserPromptSubmit Hook**: Intercepts prompts before Claude processes them
- **2-Tier Keyword Matching**: Primary keywords trigger alone, secondary need 2+ matches
- **Context-Aware Nudges**: Suggests relevant skills based on prompt intent

```
User Prompt ──▶ Hook ──▶ Keyword Analysis ──▶ Skill Suggestion
                              │
    "send message to slack"   │   Matches: "slack", "message"
              ──────────────▶ │ ──────────────▶ "Try /slack-agent!"
```

---

## Results

**Without any mandates, purely data-driven approach:**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| AI Tool Adoption | 6% | 18% | **3x increase** |

This proves that **"Measurement brings visibility, and sharing drives adoption."**

---

## Features

- **OpenTelemetry Integration**: Industry-standard telemetry for Claude Code usage
- **Prompt Analytics**: Track, analyze, and audit all prompts
- **MCP Server Management**: Centrally manage MCP servers across your organization
- **Skill Management**: Create, share, and auto-deploy reusable prompts/workflows
- **Hook Deployment**: Deploy Claude Code hooks remotely from dashboard
- **Real-time Nudges**: Context-aware skill suggestions via 2-tier keyword matching
- **Team Management**: Organize users into teams with shared configurations
- **Auto-Update**: CLI binary automatically updates when new versions are available

---

## Quick Start

### Prerequisites

- [Claude Code](https://www.anthropic.com/claude-code) installed
- [Supabase](https://supabase.com) account (for data persistence)
- [ClickHouse](https://clickhouse.com) instance (for analytics)
- macOS (Intel/Apple Silicon) or Linux (x86_64/arm64)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ZEP-Inc/zeude.git
   cd zeude
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and ClickHouse credentials
   ```

3. **Start the dashboard**
   ```bash
   cd zeude/dashboard
   pnpm install
   pnpm dev
   ```

4. **Run database migrations**
   ```bash
   # Apply Supabase migrations from zeude/dashboard/supabase/migrations/
   # Apply ClickHouse migrations from zeude/dashboard/clickhouse/migrations/
   ```

5. **Install CLI on client machines**
   ```bash
   curl -fsSL https://your-dashboard-url/releases/install.sh | ZEUDE_AGENT_KEY=zd_xxx bash
   ```

---

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  claude (shim)  │────▶│  real claude     │────▶│  Claude API     │
│  ~/.zeude/bin   │     │  /usr/local/bin  │     │                 │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         │ on startup: sync config, skills, hooks
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dashboard API  │────▶│  Supabase        │     │  ClickHouse     │
│  /api/config    │     │  (Config, Users) │     │  (Analytics)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

When a developer runs `claude`:
1. **Zeude Shim** intercepts the command
2. **Syncs** latest skills, hooks, and MCP configs from dashboard
3. **Executes** the real Claude CLI with synced configurations
4. **Hooks** provide real-time guidance during the session

---

## Project Structure

```
zeude/
├── cmd/                    # Go CLI source (shim, doctor)
├── dashboard/              # Next.js web dashboard
│   ├── src/app/api/       # API routes
│   ├── supabase/          # Database migrations
│   └── clickhouse/        # Analytics schema
├── deployments/           # Docker/K8s configurations
├── internal/              # Go internal packages
│   ├── mcpconfig/        # MCP sync logic
│   └── autoupdate/       # Self-update mechanism
└── scripts/              # Build and deployment
```

---

## Documentation

- [Supabase Migrations](zeude/dashboard/supabase/migrations/) - Database schema
- [ClickHouse Migrations](zeude/dashboard/clickhouse/migrations/) - Analytics schema
- [Deployment Configs](zeude/deployments/) - Docker/K8s configurations
- [CLI Source Code](zeude/cmd/) - Go shim implementation

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Security

Please see our [Security Policy](SECURITY.md) for reporting vulnerabilities.

---

## Enterprise

### Enterprise Support & Services

For organizations requiring enterprise-grade support, custom features, or professional services:

- **Dedicated Support**: Priority support with guaranteed SLAs
- **Custom Development**: Tailored features for your organization
- **Deployment Assistance**: On-premises or cloud deployment help
- **Training**: Comprehensive training for your team

### Contact Us

| Contact | Email |
|---------|-------|
| General Inquiries | [dev@zep.us](mailto:dev@zep.us) |
| Enterprise Sales | [jaegyu.lee@zep.us](mailto:jaegyu.lee@zep.us) |

---

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

```
Copyright 2024-2025 ZEP Co., Ltd.
```

---

## Acknowledgments

- [Anthropic](https://www.anthropic.com) for Claude and Claude Code
- [Supabase](https://supabase.com) for backend infrastructure
- [ClickHouse](https://clickhouse.com) for analytics capabilities

---

<p align="center">
  <strong>Built by <a href="https://zep.us">ZEP</a></strong><br>
  <em>"Measurement brings visibility, sharing drives adoption"</em>
</p>
