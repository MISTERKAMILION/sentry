# S.E.N.T.R.Y — Week 1 implementation report

**Date:** 2026-10-25
**Specification:** Authoritative Implementation Handoff v1.2
**Status:** **PENDING FULL SUPABASE CI — Week 1 is not being claimed as accepted**
**Week 2:** Not started

## 1. Repository starting state

No repository was present. With manager/user approval, a minimal greenfield Next.js 16 + TypeScript + Supabase project was created. Starter UI assets were removed. No scanner UI, queue, worker, research adapter, LLM integration, or deterministic scorer was implemented.

## 2. Files created or changed

- Application/API: `app/api/scans/route.ts`
- Request validation and canonical hashing: `lib/scans/request.ts`
- User-scoped Supabase server client: `lib/supabase/server.ts`
- Versioned rules: `lib/scoring/rules/2026-01.ts`
- Supabase configuration: `supabase/config.toml`, `supabase/seed.sql`
- Four migrations under `supabase/migrations/`
- Test helper: `tests/helpers/supabase.ts`
- Five mandatory suites under `tests/week1/`
- Client-secret guard: `scripts/check-client-secrets.mjs`
- Test configuration: `vitest.config.ts`
- CI: `.github/workflows/week1.yml`
- Project metadata and documentation: `.env.example`, `.gitignore`, `README.md`, `package.json`, `package-lock.json`
- Next.js scaffold files retained as applicable; starter pages, styles, images, and favicon were removed.

## 3. Migration list

1. `20261025000100_create_types.sql` — scan, scoring, check, finding, job, monitoring, and notification enums.
2. `20261025000200_create_schema.sql` — ten tables, foreign keys, ownership-safe composite keys, constraints, indexes, timestamp triggers, and evidence-reference integrity.
3. `20261025000300_enable_rls.sql` — RLS on all ten tables and explicit authenticated-role CRUD policies.
4. `20261025000400_create_scan_idempotency.sql` — transaction-safe `create_scan_idempotent` RPC and least-privilege execute grants.

## 4. Schema and constraint summary

- Tables: `profiles`, `products`, `scans`, `scan_checks`, `evidence_sources`, `risk_findings`, `monitoring_subscriptions`, `notifications`, `scan_jobs`, `idempotency_keys`.
- `scans` includes nullable `compliance_risk_score`, nullable `coverage`, `scoring_status`, `manual_review_required`, `scoring_config_version`, and `idempotency_key`.
- A scored row must contain a numerical score; non-scored or not-yet-scored rows cannot contain one.
- Risk scores are constrained to 0–100 and coverage to 0–1. Unknown risk and coverage remain `NULL`, never zero.
- `scan_checks` supports `queued | running | completed | partial | unavailable | failed`; unavailable/failed/not-yet-assessed rows cannot carry a risk score.
- Every scan stores a non-empty scoring configuration version; the default and API value are `2026-01`.
- Composite ownership foreign keys prevent records from referencing another user's product or scan even if an identifier is known.
- Evidence fingerprints are unique per scan and use the documented 64-character SHA-256 shape.
- Findings require unique, non-empty evidence IDs. Triggers reject evidence from another scan and prevent cited evidence from being deleted, re-keyed, or moved.
- Notifications have logical deduplication keys; jobs and checks are unique per scan/check type.

## 5. RLS policy summary

- RLS is enabled on all ten tables.
- Forty policies provide SELECT, INSERT, UPDATE, and DELETE restrictions.
- `scans` and `products` UPDATE policies use both `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`.
- `scan_checks`, `evidence_sources`, `risk_findings`, and `scan_jobs` enforce ownership through the parent scan for every operation.
- Privileged credentials are not used by the application API. The route forwards the user's bearer token through the public anon-key client so Auth and RLS apply.

## 6. Idempotency implementation

- `POST /api/scans` requires Supabase bearer authentication and `Idempotency-Key`.
- Input is validated before hashing. Canonical JSON recursively sorts object keys and applies validated defaults/normalization.
- SHA-256 hashes the canonical validated request, not raw JSON serialization.
- The RPC claims `(user_id, endpoint, key)` with an atomic insert/on-conflict operation before creating a scan.
- Same user/key/body returns the original scan; same key/different body raises `P0409`, mapped to HTTP 409.
- Product, scan, idempotency association, and optional monitoring subscription are committed atomically.
- New scans return HTTP 201; replays return HTTP 200. Concurrent-call behavior was exercised against PostgreSQL.

## 7. Commands and verified results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run check:client-secrets` | **PASS** — zero service-role references in `"use client"` files |
| `npm run build` | **PASS** in a writable validation copy; `/api/scans` compiled as dynamic |
| Built-route unauthenticated POST probe | **PASS** — HTTP 401 |
| Four migrations on fresh PostgreSQL 17 | **PASS** |
| Real PostgreSQL RLS/constraint/idempotency behavior harness | **PASS** — 8/8 behavior groups |
| `npx supabase start` | **BLOCKED BY ENVIRONMENT** — no Docker or Podman available |

The PostgreSQL behavior groups covered scan CRUD isolation, child CRUD isolation, UPDATE ownership escalation, direct child-query isolation, idempotency replay/conflict/concurrency, enum/null/score/rules-version constraints, cross-scan evidence rejection, and cited-evidence deletion protection. These are real database checks, but they are not being represented as a substitute for the required full Supabase Auth/Data API CI run.

## 8. Mandatory Week 1 suites

| Suite | Implementation | Full Supabase result |
|---|---|---|
| 1. RLS isolation | Complete; includes all CRUD operations on scans, checks, evidence, and findings | **NOT RUN — pending Docker-enabled CI** |
| 2. RLS UPDATE escalation | Complete; also covers products and child reparenting | **NOT RUN — pending Docker-enabled CI** |
| 3. Child-table isolation | Complete; direct parent-scan queries | **NOT RUN — pending Docker-enabled CI** |
| 4. Idempotency | Complete; canonical replay, HTTP 409, and concurrent requests | **NOT RUN — pending Docker-enabled CI** |
| 5. Schema contract | Complete; nullability, enums, score presence, rules version, and evidence integrity | **NOT RUN — pending Docker-enabled CI** |

The suites use real Supabase Auth Admin user creation, real sign-in/access tokens, user-scoped Data API clients, and service-role access only for setup/assertion. Mocked authorization is not used.

## 9. CI status

`.github/workflows/week1.yml` starts a fresh Supabase stack, resets/applies migrations, exports local credentials, runs all five suites, and then builds the app. The workflow is ready but has not run on a CI runner in this session. Therefore, “all five suites pass in CI” remains an open acceptance item.

## 10. Definition-of-done assessment

- Fresh PostgreSQL migrations: verified.
- Fresh **Supabase** migration and Auth/Data API integration: pending CI.
- Five suites passing in CI: pending.
- `scoring_config_version` write/read: verified against real PostgreSQL; full Supabase suite pending.
- Invalid enum and nullable-field behavior: verified against real PostgreSQL; full Supabase suite pending.
- No service-role credentials in client files: verified.
- No unresolved design decisions identified.
- Environment blocker: a Docker-enabled CI runner or accessible test Supabase project is required.

**Stop condition honored:** no Week 2 work has begun. Week 1 should not be marked green until the full Supabase CI workflow passes.
