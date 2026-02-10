# Zeude Dashboard

Web-based monitoring and configuration management dashboard for the Zeude platform.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI)
- **Database**: Supabase (auth, user/skill data) + ClickHouse (analytics)
- **Charts**: Recharts
- **Package Manager**: pnpm

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp ../../.env.example .env.local
# Edit .env.local with your Supabase and ClickHouse credentials

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Project Structure

```
src/app/
├── (auth)/           # Authentication pages
├── (dashboard)/      # User-facing dashboard
│   ├── daily/        # Daily usage view
│   ├── leaderboard/  # Team leaderboard
│   └── sessions/     # Session history
├── (admin)/admin/    # Admin panel
│   ├── analytics/    # Usage analytics
│   ├── hooks/        # Hook management
│   ├── mcp/          # MCP server management
│   ├── skills/       # Skill management
│   └── team/         # Team management
└── api/              # API routes
    ├── admin/        # Admin APIs
    ├── auth/         # Authentication
    ├── config/       # CLI config sync
    ├── leaderboard/  # Leaderboard data
    └── prompts/      # Prompt analytics
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |

## Database

- **Supabase migrations**: `supabase/migrations/`
- **ClickHouse schema**: `clickhouse/tables/` and `clickhouse/migrations/`
