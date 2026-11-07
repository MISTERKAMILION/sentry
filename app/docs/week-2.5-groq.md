# Week 2.5 — Groq evidence-report pipeline

This phase adds a validated, evidence-grounded AI report. It does **not** add the
deterministic scorer, severity assignment, scoring status, or any queue changes.

## Dependency

The implementation uses the official `groq-sdk` package. It is not present in the
current lockfile because this environment has no Node toolchain. The administrator
must install it and commit the regenerated lockfile:

```bash
npm install groq-sdk
```

The test scripts use `tsx`. If it is not already available:

```bash
npm install --save-dev tsx
```

## Configuration

Copy `.env.example` to `.env.test` and fill in server-side values. `.env*` is
gitignored; never commit real credentials or paste them into CI logs.

```dotenv
GROQ_API_KEY=
GROQ_MODEL=
GROQ_TIMEOUT_MS=30000
```

`GROQ_MODEL` must be a model that supports Groq Structured Outputs with
`strict: true`. As of the Groq documentation reviewed for this phase, strict mode
is available on `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. Do not assume other
models support strict JSON Schema without verifying the Groq documentation.

Never use a `NEXT_PUBLIC_` variable for the Groq key. The client module is
server-side only and must never be imported into a client component.

## Pipeline

1. Validate and normalize the supplied evidence records.
2. Reject empty evidence before calling Groq.
3. Send the fixed system prompt, validated product context, and serialized evidence.
4. Request strict JSON Schema output.
5. Recursively reject forbidden scoring/severity keys.
6. Validate the complete report with Zod.
7. Reject unknown, duplicate, or missing evidence references.
8. Resolve citation metadata only from the original trusted evidence records.
9. Allow one bounded corrective retry for malformed output only.

Forbidden fields are rejected, never stripped: `risk_score`,
`compliance_risk_score`, `severity`, `scoring_status`, `coverage`,
`manual_review_required`, and `risk_level`.

## Commands

Offline validation tests (no Groq request):

```bash
npx tsx scripts/test-groq-validation.ts
npm run test:ai
```

Live Groq connectivity test:

```bash
node --env-file=.env.test --import tsx scripts/test-groq.ts
```

Existing checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The live Groq test is not a substitute for the Week 1 Supabase CI workflow.

## Security notes

- The Groq key used during development was shared in a chat transcript. Rotate it
  before production use and store the replacement only in the server environment.
- The Supabase secret key supplied in chat was truncated. Paste the full
  `sb_secret_...` value directly into `.env.test` locally.
- The publishable key is safe for browser use only with RLS and policies correctly
  configured; it was saved locally with the test configuration.
- The AI report is a validated artifact, not a compliance decision. A successful
  generation must not set a score, severity, or `scoring_status`.
