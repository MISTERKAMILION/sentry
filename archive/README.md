# S.E.N.T.R.Y — Week 1 + Week 2 foundation

Minimal Next.js + Supabase foundation for the AI Product Compliance Scanner. The
durable queue schema and claim/heartbeat/recovery functions are in place; the
worker, research adapter, and deterministic scorer belong to later acceptance
gates.

## Included

- Eight ordered Supabase migrations for the ten-table schema, constraints, indexes,
  RLS, evidence-reference integrity, atomic scan idempotency, trust-field write
  restrictions, and the durable job queue.
- Versioned scoring configuration in `lib/scoring/rules/2026-01.ts`.
- Authenticated `POST /api/scans` with canonical request hashing and `Idempotency-Key` handling.
- Atomic creation of the scan plus its four initial checks (`legal`, `ip`, `safety`, `recalls`).
- Service-role-only queue functions for lease-based claiming, heartbeats, fencing,
  retry/backoff, and expired-lease recovery.
- Five mandatory Week 1 integration suites, Week 2 queue integration tests, and
  AI report validation tests using real Supabase Auth users and RLS-enforcing clients.
- GitHub Actions workflow that starts a fresh Supabase stack, resets and migrates the database, and runs all checks.

## Week 2 — durable queue

Queue operations live in `lib/queue/jobs.ts` and call Supabase RPC functions in
`supabase/migrations/20261025000800_create_queue_functions.sql`. Workers must use
the service-role key; `anon` and `authenticated` cannot call the queue functions or
write `scans`/`scan_jobs` directly.

- `claim_job` atomically claims one due job with `FOR UPDATE SKIP LOCKED`, increments
  `attempts`, and issues a lease token.
- `heartbeat_job` extends a live lease and rejects stale tokens.
- `complete_job` and `fail_job` require the live lease token; stale or expired workers
  are fenced with `P0409`.
- `fail_job` retries with exponential backoff until `max_attempts`, then fails.
- `recover_expired_leases` returns expired jobs to `retry_wait` or marks them failed
  when the attempt budget is exhausted.

## Week 2.5 — Groq evidence reports

The AI report pipeline is implemented under `lib/ai/` with strict runtime
validation, recursive forbidden-field rejection, and citation checks against the
trusted evidence array. See `docs/week-2.5-groq.md` for the `groq-sdk`
dependency, environment variables, and administrator test commands.

The AI report is not a compliance score and must not set severity or
`scoring_status`.

## Local verification

Prerequisites: Node.js 20+, npm, Docker, and the Supabase CLI.

```bash
npm ci
npx supabase start
npx supabase db reset --yes
npx supabase status -o env
```

Create `.env.test` from `.env.example` using the local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` printed by Supabase. These values are test-only credentials; never expose the service-role key to browser code.

```bash
npm run lint
npm run typecheck
npm run check:client-secrets
npm test
npm run build
```

The integration tests require a running Supabase Auth and Data API. They do not replace RLS with mocks. Test users are created through Supabase Auth Admin and deleted after each suite.

## Scan creation contract

`POST /api/scans` requires a bearer access token and an `Idempotency-Key` header. A new request returns `201`; an identical canonical request returns the original scan with `200`; reusing the key with a different validated request returns `409`.

The endpoint performs durable product/scan creation, enqueues the four initial jobs, and optionally creates a monitoring subscription. It does not dispatch or await research work.
