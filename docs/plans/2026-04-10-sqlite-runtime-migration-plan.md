# SQLite Runtime + Supabase Migration Implementation Plan

> Status: revised for execution readiness on 2026-04-10

**Goal:** Replace Supabase as the runtime operational datastore with SQLite, keep ClickHouse for analytics, preserve the existing client `releases/install.sh` UX, and add a supported migration path from existing Supabase deployments to SQLite.

**Architecture:** The dashboard runtime becomes `SQLite + ClickHouse`. All operational reads and writes move behind a repository layer so API routes, auth/session code, and mixed analytics helpers stop calling Supabase directly. Supabase remains only as a migration source for existing installations. Release packaging is extended so the dashboard continues to serve CLI artifacts and additionally serves a server bundle plus `install-server.sh` for single-host deployment.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Go CLI binaries, SQLite runtime, ClickHouse analytics, shell install scripts, Docker multi-stage release build.

---

## Scope

In scope:
- Replace runtime operational storage with SQLite.
- Keep ClickHouse analytics code paths and envs.
- Add repository layer for users, sessions, OTT, invites, skills, hooks, MCP servers, agents, cohorts, install status, and related admin metadata.
- Add SQLite schema, migration runner, and bootstrap path.
- Add Supabase-to-SQLite migration tool with dry-run and verification.
- Add server install packaging and `install-server.sh`.
- Keep `/releases/install.sh` and CLI binaries working.

Out of scope:
- Supporting runtime `postgres` or runtime `supabase` provider selection.
- Replacing ClickHouse analytics with SQLite.
- Re-architecting the CLI sync protocol.
- Multi-node deployment support.

## Success Criteria

- Fresh install can run on a single host using SQLite for operational data.
- Existing client install command still works against the new dashboard.
- All runtime operational APIs and helpers no longer depend on `@supabase/supabase-js`.
- Existing analytics pages and routes continue using ClickHouse.
- Existing Supabase deployments can migrate operational data into SQLite with a verifiable tool.
- Route tests, migration tests, and packaging smoke checks cover the high-risk flows.

## Current State Summary

Runtime operational logic currently depends directly on Supabase in these areas:
- Auth and session handling: `zeude/dashboard/src/lib/session.ts`
- Supabase client creation: `zeude/dashboard/src/lib/supabase.ts`
- Config sync API: `zeude/dashboard/src/app/api/config/[agentKey]/route.ts`
- Auth callback, OTT issuance, and logout: `zeude/dashboard/src/app/api/auth/**`
- Public invite validation and claim flow: `zeude/dashboard/src/app/api/invite/[token]/route.ts`
- User skill preference APIs: `zeude/dashboard/src/app/api/user/skills/route.ts`
- Status and install-reporting APIs: `zeude/dashboard/src/app/api/status/[agentKey]/route.ts`
- Admin CRUD and helper modules under `zeude/dashboard/src/app/api/admin/**` and `zeude/dashboard/src/lib/data/**`
- Mixed analytics-plus-operational routes: `leaderboard`, `prompts`, `skill-suggestions`, `admin/analytics/**`
- User name resolution helper: `zeude/dashboard/src/lib/name-resolution.ts`

Analytics already has a partial optional boundary:
- ClickHouse client and analytics helpers: `zeude/dashboard/src/lib/clickhouse.ts`

Release packaging already serves CLI assets from the dashboard:
- `zeude/Dockerfile`
- `zeude/scripts/build-release.sh`
- `zeude/releases/install.sh`

## Execution Preconditions

Lock these before implementation starts:
- Choose the SQLite driver and confirm it works with `node:20-alpine`, Next standalone output, and CI.
- Decide whether install status tables remain in SQLite v1 or are intentionally dropped with route changes.
- Decide whether admin bootstrap is installer-driven, web-first, or both.
- Decide release artifact shape: tarball only, Docker image only, or both.

If these decisions are not locked first, the plan will churn mid-implementation.

## SQLite Driver Decision

Required properties:
- Must work in the Next.js server runtime used by the dashboard.
- Must work inside the current Docker build and runtime model.
- Must support transactions, prepared statements, and predictable file locking behavior.
- Must have a testable story for local dev and CI.

Recommended default:
- Prefer `better-sqlite3` if it builds cleanly in the current Alpine-based image and standalone bundling includes it correctly.
- If Alpine/native build friction is too high, switch the runtime image from Alpine to Debian slim before implementation rather than forcing a weaker driver choice late.

Do not start repository implementation until this is decided and proven with a throwaway build spike.

## Data Model To Preserve In SQLite

Operational tables that must exist in SQLite unless explicitly removed by product decision:
- `zeude_users`
- `zeude_sessions`
- `zeude_one_time_tokens`
- `zeude_invites`
- `zeude_skills`
- `zeude_hooks`
- `zeude_mcp_servers`
- `zeude_agents`
- `zeude_cohort_members`
- `zeude_mcp_install_status`
- `zeude_hook_install_status`
- any supporting lookup/admin tables referenced by existing APIs

Field handling rules:
- Keep IDs stable during migration.
- Store array/object fields as JSON text in SQLite.
- Normalize timestamps as ISO 8601 UTC strings.
- Preserve `status`, `role`, `team`, `agent_key`, `disabled_skills`, `files`, `env`, `teams`, `contributors`, and similar fields with the same semantics.
- Add unique indexes for runtime invariants such as `email`, `agent_key`, `token`, and route-level conflict keys.

## Supabase Semantics Inventory To Reproduce

This migration is not just table copying. The runtime currently depends on Supabase/Postgres semantics that must be reimplemented explicitly:

- Atomic skill disable toggle via Postgres RPC `toggle_disabled_skill`
- `upsert` with `onConflict` and duplicate-ignore behavior for cohort registration and status reporting
- Joined selects used by session/auth callbacks
- Count-only reads such as `select(..., { count: 'exact', head: true })`
- Array containment filters such as `teams.cs`
- Claim-first invite flow with rollback on downstream failure
- Bulk ID and email lookups used by analytics name resolution
- Stable ordering relied on by config sync hashing or response determinism

Every one of these must map to either:
- a repository method plus transaction boundary
- a unique index plus conflict handling policy
- or a deliberate behavior change documented in advance

## Environment Model

New runtime env:
- `DATABASE_PROVIDER=sqlite`
- `DATABASE_PATH=/var/lib/zeude/zeude.db`
- `SESSION_SECRET=<generated>`
- `NEXT_PUBLIC_APP_URL=<dashboard-url>`
- `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`

Migration-only env or flags:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Runtime rules:
- Supabase env validation must be removed from startup for SQLite mode.
- ClickHouse remains optional for runtime startup but required for analytics features.
- SQLite path creation, permissions, and backup location must be part of installer behavior.

## Test Strategy

Meaningful coverage is possible and required.

Add or update tests in these layers:
- Repository unit tests for SQLite CRUD, filtering, and transaction behavior.
- Route tests for auth, config sync, admin CRUD, invite claim, skill toggle, and status reporting.
- Migration tests that seed Supabase-shaped records, import them into SQLite, and verify row counts and transformed fields.
- Packaging smoke tests for release artifacts and installer assumptions.
- Build verification for the chosen SQLite driver inside the target runtime image.

Minimum required automated verification:
- `vitest` on all touched route tests.
- New SQLite repository tests.
- New migration command tests.
- Existing ClickHouse schema/config tests must still pass.
- `npm run build` for dashboard after runtime env cleanup.
- `go test ./...` for CLI/install code touched by release changes.

## Phase 0: Spike and Semantic Inventory

This is a required phase before the current Task 1.

**Files:**
- Create: `docs/plans/2026-04-10-sqlite-runtime-semantic-inventory.md`
- Optionally create: temporary driver spike files under `zeude/dashboard/scripts/` or `zeude/dashboard/src/lib/db/sqlite/`

**Steps:**
1. Confirm the exact set of Supabase-backed routes and helpers still in runtime use.
2. Inventory every Postgres/Supabase behavior that needs explicit SQLite replacement.
3. Run a small driver compatibility spike against the current Docker/runtime model.
4. Lock the SQLite driver decision before schema and repository work starts.
5. Record any deliberate v1 exclusions, if there are any.

**Verification:**
- Produce a short semantic inventory doc and a passing driver smoke result.
- Do not start schema work until this phase is complete.

## Task 1: Create the planning and scaffolding directories

**Files:**
- Keep: `docs/plans/2026-04-10-sqlite-runtime-migration-plan.md`
- Create: `zeude/dashboard/src/lib/db/`
- Create: `zeude/dashboard/src/lib/db/sqlite/`
- Create: `zeude/dashboard/src/lib/db/repositories/`
- Create: `zeude/dashboard/src/lib/db/migration/`
- Create: `zeude/dashboard/scripts/`
- Create: `zeude/server-install/`

**Steps:**
1. Create the DB-layer, migration, and packaging directories.
2. Add placeholder modules so import paths are stable before larger refactors.
3. Commit only directory and scaffold additions.

**Verification:**
- Run: `find zeude/dashboard/src/lib/db -maxdepth 3 -type d | sort`
- Expected: `repositories`, `sqlite`, and `migration` directories exist.

## Task 2: Introduce the operational DB boundary

**Files:**
- Create: `zeude/dashboard/src/lib/db/types.ts`
- Create: `zeude/dashboard/src/lib/db/index.ts`
- Create repository interfaces for:
  - `users`
  - `sessions`
  - `tokens`
  - `invites`
  - `skills`
  - `hooks`
  - `mcp`
  - `agents`
  - `cohorts`
  - `install-status`
- Modify: `zeude/dashboard/src/lib/session.ts`
- Modify: `zeude/dashboard/src/app/api/config/[agentKey]/route.ts`
- Modify: `zeude/dashboard/src/lib/name-resolution.ts`

**Steps:**
1. Define repository interfaces that cover all current operational queries and writes, not just simple CRUD.
2. Add a runtime `getOperationalDb()` factory that returns SQLite-backed repositories.
3. Refactor one narrow path first, preferably config sync, to prove the boundary.
4. Refactor session/auth helpers and name-resolution to depend on repositories, not Supabase.
5. Commit the boundary before converting every route.

**Tests:**
- Create: `zeude/dashboard/src/lib/db/repositories/repositories.test.ts`
- Modify: `zeude/dashboard/src/app/api/config/[agentKey]/route.test.ts`

**Verification:**
- Run: `npm test -- --runInBand src/app/api/config/[agentKey]/route.test.ts`
- Expected: config route still passes after removing direct Supabase dependency from the route.

## Task 3: Add SQLite connection and migration runner

**Files:**
- Create: `zeude/dashboard/src/lib/db/sqlite/connection.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/migrator.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/migrations/0001_initial_operational_schema.sql`
- Create: `zeude/dashboard/src/lib/db/sqlite/migrations/0002_indexes_and_conflicts.sql`
- Create: `zeude/dashboard/src/lib/db/sqlite/migrations/0003_seed_defaults.sql`
- Create: `zeude/dashboard/scripts/migrate-sqlite.ts`
- Modify: `zeude/dashboard/package.json`

**Steps:**
1. Implement one connection helper with configurable DB path.
2. Add migrations for all runtime tables, indexes, and conflict constraints.
3. Encode route-critical invariants in schema, not just in TypeScript.
4. Build a migration runner script and package command.
5. Ensure migrations are idempotent enough for installer use.

**Tests:**
- Create: `zeude/dashboard/src/lib/db/sqlite/migrator.test.ts`

**Verification:**
- Run: `npm run migrate:sqlite`
- Expected: SQLite file is created and schema migrations apply successfully.

## Task 4: Implement SQLite repositories

**Files:**
- Create SQLite-backed repositories for:
  - `users`
  - `sessions`
  - `tokens`
  - `invites`
  - `skills`
  - `hooks`
  - `mcp`
  - `agents`
  - `cohorts`
  - `install-status`
- Create: `zeude/dashboard/src/lib/db/sqlite/admin-support.ts`

**Steps:**
1. Implement repository methods for each operational entity.
2. Mirror current filtering semantics for `is_global`, `teams`, `status`, contributors, and disabled skills.
3. Preserve deterministic sorting where config sync depends on stable hashes.
4. Add helper functions for JSON column serialization and deserialization.
5. Add transaction wrappers for invite claim, skill toggle, status upsert, and cohort registration.
6. Commit by logical slice if needed: auth/session first, then config data, then admin/public CRUD.

**Tests:**
- Create: `zeude/dashboard/src/lib/db/sqlite/users-repository.test.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/sessions-repository.test.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/invites-repository.test.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/skills-repository.test.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/config-repositories.test.ts`
- Create: `zeude/dashboard/src/lib/db/sqlite/install-status-repository.test.ts`

**Verification:**
- Run: `npm test -- --runInBand src/lib/db/sqlite`
- Expected: repository tests pass for inserts, lookups, updates, filters, deletes, and concurrent conflict paths.

## Task 5: Refactor auth, session, and public invite flows to SQLite

**Files:**
- Modify: `zeude/dashboard/src/lib/session.ts`
- Modify: `zeude/dashboard/src/app/api/auth/ott/route.ts`
- Modify: `zeude/dashboard/src/app/api/auth/callback/route.ts`
- Modify: `zeude/dashboard/src/app/api/auth/logout/route.ts`
- Modify: `zeude/dashboard/src/app/api/invite/[token]/route.ts`
- Modify: `zeude/dashboard/src/app/(auth)/auth/page.tsx` if needed for error messages

**Steps:**
1. Replace Supabase lookups in OTT issuance with repository calls.
2. Replace session creation, validation, and logout flows with SQLite repository calls.
3. Move invite validation and claim flow to a transaction-backed SQLite implementation.
4. Keep cookie behavior identical to avoid client-facing regressions.
5. Remove Supabase-specific connection error handling from runtime auth paths.
6. Commit auth/session/public invite changes separately from admin CRUD.

**Tests:**
- Create: `zeude/dashboard/src/app/api/auth/ott/route.test.ts`
- Create: `zeude/dashboard/src/app/api/auth/callback/route.test.ts`
- Create: `zeude/dashboard/src/app/api/invite/[token]/route.test.ts`
- Modify: existing auth/session tests if added during refactor

**Verification:**
- Run: `npm test -- --runInBand src/app/api/auth src/app/api/invite`
- Expected: OTT creation, callback, invalid token, logout, invite validation, invite double-claim, and invite rollback flows pass.

## Task 6: Refactor config sync, status, and admin/public operational APIs to SQLite

**Files:**
- Modify: `zeude/dashboard/src/app/api/config/[agentKey]/route.ts`
- Modify: `zeude/dashboard/src/app/api/status/[agentKey]/route.ts`
- Modify: `zeude/dashboard/src/app/api/user/skills/route.ts`
- Modify: `zeude/dashboard/src/app/api/skill-rules/route.ts`
- Modify: `zeude/dashboard/src/app/api/skill-suggest/route.ts`
- Modify: `zeude/dashboard/src/app/api/skill-suggestions/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/agents/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/agents/[id]/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/hooks/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/hooks/[id]/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/skills/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/skills/[id]/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/mcp/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/mcp/[id]/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/users/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/users/[id]/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/users/[id]/key/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/invites/route.ts`
- Modify: `zeude/dashboard/src/app/api/admin/cohorts/route.ts`
- Modify: `zeude/dashboard/src/lib/data/*.ts` as needed

**Steps:**
1. Convert config sync route fully to repository-backed reads.
2. Convert status reporting and user skill APIs.
3. Replace skill toggle RPC semantics with a repository transaction or conflict-safe update.
4. Convert admin CRUD routes one resource at a time.
5. Keep response shapes stable to avoid frontend churn.
6. Remove unused `supabase.ts` imports from refactored routes and helpers.

**Tests:**
- Modify existing route tests:
  - `zeude/dashboard/src/app/api/admin/agents/[id]/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/agents/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/hooks/[id]/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/invites/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/skills/[id]/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/skills/route.test.ts`
  - `zeude/dashboard/src/app/api/admin/users/[id]/route.test.ts`
  - `zeude/dashboard/src/app/api/config/[agentKey]/route.test.ts`
- Create new tests where coverage is missing:
  - `status/[agentKey]`
  - `user/skills`
  - `admin/cohorts`
  - `admin/users/[id]/key`
  - `skill-rules`
  - `skill-suggest`

**Verification:**
- Run: `npm test -- --runInBand src/app/api/admin src/app/api/config src/app/api/status src/app/api/user src/app/api/skill-rules src/app/api/skill-suggest`
- Expected: all operational route tests pass using SQLite-backed setup.

## Task 7: Remove Supabase runtime validation and runtime-only dependencies

**Files:**
- Modify: `zeude/dashboard/src/lib/env.ts`
- Modify or delete: `zeude/dashboard/src/lib/supabase.ts`
- Modify: `zeude/dashboard/package.json`
- Modify: lockfile used by the dashboard

**Steps:**
1. Change env validation so runtime no longer requires Supabase keys.
2. Demote `supabase.ts` to migration-only utility or delete it if fully replaced.
3. Remove runtime imports of `@supabase/supabase-js` from dashboard code.
4. Keep the library only if the migration tool still uses it.
5. Commit dependency and env cleanup separately.

**Tests:**
- Create: `zeude/dashboard/src/lib/env.test.ts`

**Verification:**
- Run: `npm run build`
- Expected: production build succeeds without Supabase runtime envs.

## Task 8: Implement Supabase-to-SQLite migration tool

**Files:**
- Create: `zeude/dashboard/src/lib/db/migration/supabase-client.ts`
- Create: `zeude/dashboard/src/lib/db/migration/export.ts`
- Create: `zeude/dashboard/src/lib/db/migration/transform.ts`
- Create: `zeude/dashboard/src/lib/db/migration/import.ts`
- Create: `zeude/dashboard/src/lib/db/migration/verify.ts`
- Create: `zeude/dashboard/scripts/migrate-supabase-to-sqlite.ts`
- Modify: `zeude/dashboard/package.json`

**Steps:**
1. Add a migration-only Supabase client wrapper.
2. Export operational tables in a deterministic order respecting foreign-key and conflict dependencies.
3. Transform Supabase rows to SQLite row shapes, including JSON field normalization.
4. Import into a fresh SQLite DB inside a transaction per table or logical batch.
5. Add row-count verification and a human-readable summary report.
6. Support `--dry-run`, `--force`, and `--report <path>`.
7. Document cutover sequence: freeze writes, export, import, verify, switch runtime, smoke test, rollback trigger.

**Tests:**
- Create: `zeude/dashboard/src/lib/db/migration/transform.test.ts`
- Create: `zeude/dashboard/src/lib/db/migration/verify.test.ts`
- Create: `zeude/dashboard/scripts/migrate-supabase-to-sqlite.test.ts`

**Verification:**
- Run: `npm test -- --runInBand src/lib/db/migration`
- Run: `node ./scripts/migrate-supabase-to-sqlite.ts --dry-run --supabase-url=... --supabase-service-role-key=... --sqlite-path=/tmp/zeude.db`
- Expected: dry-run prints counts and planned table imports without mutating SQLite.

## Task 9: Keep ClickHouse intact and explicitly separate analytics from operational DB

**Files:**
- Modify: `zeude/dashboard/src/lib/clickhouse.ts`
- Modify: analytics routes under `zeude/dashboard/src/app/api/admin/analytics/**`
- Modify: `zeude/dashboard/src/app/api/leaderboard/route.ts`
- Modify: `zeude/dashboard/src/app/api/prompts/route.ts`
- Modify: `zeude/dashboard/src/app/api/prompts/[id]/route.ts`
- Modify: `zeude/dashboard/src/lib/name-resolution.ts`

**Steps:**
1. Audit analytics routes that currently use both ClickHouse and Supabase.
2. Replace operational user/name lookups with SQLite repositories.
3. Leave ClickHouse queries unchanged unless absolutely required.
4. Ensure analytics pages still degrade cleanly when ClickHouse is absent.
5. Preserve email fallback behavior for legacy analytics rows.

**Tests:**
- Create or update route tests for mixed analytics-plus-operational lookups.

**Verification:**
- Run: `npm test -- --runInBand src/app/api/admin/analytics src/app/api/leaderboard src/app/api/prompts`
- Expected: analytics routes still resolve user metadata through SQLite and metrics through ClickHouse mocks.

## Task 10: Add server install packaging

**Files:**
- Create: `zeude/server-install/install-server.sh`
- Create: `zeude/server-install/zeude.service`
- Create: `zeude/server-install/bootstrap-admin.sh` or `.ts`
- Create: `zeude/server-install/README.md`
- Modify: `zeude/Dockerfile`
- Modify: `zeude/scripts/build-release.sh`

**Steps:**
1. Package a server bundle containing the built dashboard standalone output and support scripts.
2. Add `install-server.sh` that downloads the bundle, writes env/config, creates the SQLite path, runs migrations, and registers `systemd`.
3. Add admin bootstrap support so a fresh server can be initialized deterministically.
4. Ensure the dashboard still serves CLI binaries under `/releases`.
5. Verify the chosen SQLite driver and its native assets are included in the bundle and runtime image.
6. Commit release packaging separately from application refactor.

**Tests:**
- Create: `zeude/server-install/install-server-smoke.sh`

**Verification:**
- Run: `bash zeude/scripts/build-release.sh`
- Expected: release directory contains existing CLI assets plus server bundle and installer.

## Task 11: Preserve client install UX

**Files:**
- Modify: `zeude/releases/install.sh`
- Modify: `zeude/scripts/install.sh`
- Modify: `zeude/internal/autoupdate/autoupdate.go`
- Modify: docs where install command is shown

**Steps:**
1. Keep the client installer contract stable.
2. Update defaults or messaging only where required by the new SQLite server runtime.
3. Ensure agent key flow still works with SQLite-backed OTT issuance.
4. Verify no regression in URL layout or release paths.

**Tests:**
- Add shell smoke checks for `releases/install.sh` path assumptions.
- Re-run relevant Go tests under `zeude/internal`.

**Verification:**
- Run: `go test ./...`
- Expected: Go CLI/install-related tests still pass.

## Task 12: Update docs for fresh install and migration operators

**Files:**
- Modify: `README.md`
- Modify: `zeude/README.md`
- Create: `zeude/docs/sqlite-self-host.md`
- Create: `zeude/docs/supabase-to-sqlite-migration.md`
- Create: `zeude/docs/release-artifacts.md`

**Steps:**
1. Rewrite Quick Start around SQLite single-host runtime.
2. Document `install-server.sh`.
3. Document the preserved client installer flow.
4. Document migration prerequisites, dry-run, cutover, rollback, and verification.
5. Document ClickHouse as a continuing analytics dependency.

**Verification:**
- Manual review that all install commands reference existing artifacts and env names.

## Suggested Commit Sequence

1. `docs: lock sqlite runtime migration preconditions`
2. `chore: scaffold sqlite runtime db layer`
3. `refactor: add operational repository interfaces`
4. `feat: add sqlite schema and migration runner`
5. `feat: implement sqlite repositories for runtime data`
6. `refactor: move auth session and invite flows to sqlite`
7. `refactor: migrate config status and admin apis off supabase`
8. `feat: add supabase to sqlite migration tool`
9. `build: add server installer and release bundle`
10. `docs: rewrite install and migration guides`

## Risks To Review Before Execution

- SQLite library choice may affect deployment size, native build complexity, and standalone bundling.
- Invite claim, cohort registration, skill toggle, and install-status writes all depend on conflict-safe behavior that must be reimplemented carefully.
- Some analytics routes depend on both ClickHouse and operational lookups, so partial migration can leave runtime still coupled to Supabase.
- The migration tool must define exactly which operational tables are source-of-truth and which ClickHouse data remains untouched.
- Installer behavior will vary across Linux distributions; `systemd` should be the primary supported target.
- SQLite is acceptable for the declared single-host scope, but backup, file permissions, and corruption recovery need explicit operational docs.

## Open Decisions To Lock Before Coding

- Exact SQLite driver package and base image implications.
- Whether `zeude_mcp_install_status` and `zeude_hook_install_status` are retained in v1.
- Whether admin bootstrap is web-first or installer-driven.
- Whether the server bundle is a tarball only or also shipped as a Docker image.
- Whether invite and cohort data are fully migrated or intentionally re-seeded.

## Cutover and Rollback Requirements

Cutover must be documented and tested:
- Freeze operational writes on the old runtime.
- Run Supabase export and SQLite import.
- Verify row counts and spot-check high-risk entities.
- Switch runtime env to SQLite.
- Run smoke tests for auth, config sync, invite claim, admin CRUD, and analytics pages.

Rollback must be documented and tested:
- Define the exact point at which rollback is still safe.
- Preserve the pre-cutover Supabase environment and dashboard artifact version.
- Keep the generated SQLite file and verification report for incident analysis.

## Recommended Test Matrix

- Fresh SQLite install on macOS or Linux dev machine.
- Fresh SQLite server bundle install on Linux with `systemd`.
- Existing client `install.sh` against new dashboard.
- Supabase dry-run migration.
- Supabase real migration into empty SQLite DB.
- Cutover smoke test: auth, config sync, invite claim, user skill toggle, admin CRUD, analytics pages.
- Conflict-path tests: duplicate cohort registration, invite double-claim, repeated status upsert, concurrent skill toggle.

## Execution Recommendation

Use this plan only after Phase 0 is complete. The critical path is:
1. Lock driver and runtime packaging constraints.
2. Build the DB boundary and schema.
3. Move auth/config/invite/status flows first.
4. Remove residual Supabase runtime imports.
5. Add migration tooling and packaging last.

Do not start with admin CRUD breadth before auth, invite, and config-sync semantics are proven on SQLite.
