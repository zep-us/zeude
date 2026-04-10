# Zeude Dashboard

Operational state lives in SQLite. Analytics stay in ClickHouse.

SQLite is the only supported operational runtime database. Supabase is retained only as a one-time migration source.

## Local development

```bash
cp .env.example .env.local
npm install
npm run migrate:sqlite
npm run dev
```

Default local SQLite path is `.data/zeude.db`.

## One-time migration from Supabase

Existing Supabase-backed deployments must migrate to SQLite before upgrading to this runtime model.

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

- `DATABASE_PATH=/var/lib/zeude/zeude.db`
- a persistent volume mounted at `/var/lib/zeude`

ClickHouse remains external and must still be configured via env vars.

From the repo root you can also run:

```bash
bash scripts/install-server.sh
```

Quick smoke checks after install:

```bash
curl -s http://localhost:3000/api/health
docker compose --env-file /opt/zeude/config/zeude.env -f /opt/zeude/app/dashboard/docker-compose.yaml ps
sqlite3 /var/lib/zeude/zeude.db ".tables"
```
