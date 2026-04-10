# Zeude Dashboard

Operational state lives in SQLite. Analytics stay in ClickHouse.

## Local development

```bash
cp .env.example .env.local
npm install
npm run migrate:sqlite
npm run dev
```

Default local SQLite path is `.data/zeude.db`.

## One-time migration from Supabase

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
DATABASE_PATH=.data/zeude.db \
npm run migrate:supabase-to-sqlite -- --dry-run

SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
DATABASE_PATH=.data/zeude.db \
npm run migrate:supabase-to-sqlite
```

Use `--force` only if the target SQLite DB already has data and you intend to replace conflicting rows.

## Production

`docker-compose.yaml` now assumes:

- `DATABASE_PROVIDER=sqlite`
- `DATABASE_PATH=/var/lib/zeude/zeude.db`
- a persistent volume mounted at `/var/lib/zeude`

ClickHouse remains external and must still be configured via env vars.
