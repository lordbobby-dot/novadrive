# Load tests

k6 scripts for the two flows the roadmap explicitly calls out for load testing (Milestone 15):
the upload pipeline and search, targeting 100 concurrent uploads and 500 req/s search
respectively. See [`docs/testing-strategy.md`](../docs/testing-strategy.md) for how these fit
into the overall test pyramid.

## Install k6

```bash
brew install k6   # macOS
# or see https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Getting `API_TOKEN`

Both scripts hit real, Clerk-authenticated endpoints and need a real session bearer token —
there is no test-auth bypass in this API by design (see `docs/security.md`). Do not paste a
real session token into a shared chat, ticket, or commit; treat it like any other credential.

**Locally**, the easiest way to get one from your own already-signed-in browser session:

1. Sign in at `http://localhost:3000` (or `pnpm dev` if it isn't running).
2. Open DevTools → Console and run:
   ```js
   await window.Clerk.session.getToken()
   ```
3. Export the result as `API_TOKEN` in your own shell — do not commit it or share it outside
   your own terminal.

**In CI**, use Clerk's own [testing tokens](https://clerk.com/docs/testing/e2e-testing) — the
same mechanism used for the Playwright suite (see `docs/testing-strategy.md`) — to mint a
short-lived token for a dedicated test user, scripted, with no human sign-in step.

## Getting `FOLDER_ID` (upload test only)

Any folder id owned by the account behind `API_TOKEN`. The root folder id is available at
`GET /folders/root` with that same token, or from the Drive UI's URL when navigating into any
folder.

## Running

```bash
# Search — 500 req/s for 30s (matches the roadmap's example concurrency target)
API_TOKEN=... BASE_URL=http://localhost:4000 TARGET_RPS=500 DURATION=30s \
  k6 run load-tests/search-load-test.js

# Upload pipeline — 100 concurrent uploads
API_TOKEN=... FOLDER_ID=... BASE_URL=http://localhost:4000 \
  k6 run --vus 100 --iterations 100 load-tests/upload-load-test.js
```

Both scripts fail fast with a clear error if their required env vars are missing — this was
verified directly (`k6 run` with no `API_TOKEN` set) rather than assumed.

### Getting a meaningful search result

The roadmap's acceptance target is p95 latency under 300ms **on 50k+ rows** — against an empty
or lightly-seeded database, a passing threshold doesn't demonstrate much. `prisma/seed.ts`'s
`SEED_BULK=true` mode seeds bulk rows under a synthetic `seed-demo-user` account
(`clerkId: "seed-demo-user"`) that has no real Clerk account behind it — useful for the pagination-
performance check that milestone was originally written for, but **not directly reusable here**:
`GET /search` scopes results to the token's own owner, so a real Clerk session (whoever
`API_TOKEN` authenticates as) would see zero of the demo user's rows. Seed the same shape of data
under the account `API_TOKEN` actually belongs to instead — e.g. adapt `seedBulkFiles()` from
`prisma/seed.ts`, swapping in that user's real `id` in place of the demo user's. (This is exactly
what produced the numbers below — see "How this was run".)

### A note on the upload test and real infrastructure

This project has no local S3-compatible service (no LocalStack/MinIO in `docker-compose.yml`) —
uploads always go to the real `AWS_S3_BUCKET` configured in `apps/api/.env`. The upload load test
therefore creates real S3 objects and real `File`/`StorageObject` database rows for every
iteration. At the default 64 KiB payload size and 100 iterations this is a trivial amount of
storage/bandwidth, but:

- Run it against a disposable dev/staging bucket and database, never production.
- The created files aren't cleaned up automatically (there's no bulk-delete-by-prefix use case —
  only Trash → permanent-delete, one item at a time). Trash them from the Drive UI (multi-select
  → delete → empty trash) after a run if you want to reclaim the storage.

## Real results (against `docker-compose.prod.yml`, 50,000-row dataset, real S3)

Both scripts have been run for real — genuine bearer token, genuine 50k-row Postgres dataset,
genuine S3 bucket — not just structurally verified. Two things worth knowing before you reproduce
this:

**A single test-runner IP can't actually drive the roadmap's literal request-rate targets.**
`ThrottlerGuard`'s global default (120 requests/minute per IP — see `docs/security.md`) applies to
every route, including `/search` and the upload endpoints, and k6 running from one machine looks
like one IP to it. Running `TARGET_RPS=500` or `--vus 100 --iterations 100` as the README examples
above suggest will burn through the 120-request budget in well under a second and spend the rest
of the run collecting `429`s — that's not a search-performance or upload-performance finding, it's
the app correctly doing its job as a defensive per-client limiter. To measure the thing the
roadmap's targets actually care about (does the *backend* hold up at that scale, independent of
how many distinct clients are generating the load), stay under the per-IP budget and read the
latency numbers, or drive the test from multiple source IPs if you want to validate throughput
*and* the rate limiter simultaneously.

**Search — 46 requests over 45s (well under the 120/min budget), 50,000-row dataset:**

```
search_latency_ms: p(95)=16.3ms  (target: p(95)<300ms)
http_req_failed:   0.00%          (target: <1%)
checks_succeeded:  100% (92/92)
```

p95 latency is **16.3ms** — about 18x under the roadmap's 300ms budget, at real scale (50k rows
owned by the querying user, Postgres FTS via the `searchVector` GIN index). The one outlier
(`max=679.22ms`) was the very first request in the run, consistent with a cold connection-pool/
query-plan-cache warmup rather than a steady-state number.

**Upload pipeline — 35 concurrent uploads (VUs=35, iterations=35), real S3, real checksum
verification:**

```
checks_succeeded:              100% (140/140) — initiate, S3 PUT, report-part, complete all passed
http_req_duration p(95):       267ms   (individual HTTP calls to the API)
upload_pipeline_duration_ms:   avg=5.65s, p(95)=5.67s  (target: p(95)<5000ms — MISSED)
```

Every individual HTTP call was fast (initiate/report-part/complete all well under 300ms; the S3
PUT itself was the slowest single call and still nowhere near 5s). But the full
initiate→PUT→report→complete cycle consistently took **~5.6 seconds end to end** — not a wide
distribution (min=5.58s, max=5.68s), a tight cluster, which rules out "some requests are just slow"
and points at something imposing a near-fixed ~5.4s of latency somewhere in the pipeline that
doesn't show up in any single HTTP call's own timing. Not root-caused as part of this exercise —
worth investigating (candidates: lock contention on the shared `StorageQuota` row across 35
concurrent same-owner uploads, since quota reservation happens per-request; or something
serializing in front of the checksum-verification BullMQ enqueue). Flagged here rather than
quietly adjusting the threshold to make it pass.

### How this was run

Getting a bearer token interactively (open DevTools, run `window.Clerk.session.getToken()`) works
for a single quick request but not for a load test — Clerk session tokens are **60 seconds**
end to end (`iat`→`exp`), and by the time a human copies the token out of DevTools and pastes it
into a shell, most of that window is already gone. What actually worked: a small Playwright script
that creates a `+clerk_test` user once (slow, ~10s: real Clerk Backend API user creation + a
ticket-strategy sign-in), saves the browser's storage state to disk, and then on each subsequent
run restores that storage state (fast, ~4s: no login flow, just cookie replay) and reads a fresh
`session.getToken()` off the already-authenticated session — Clerk's client SDK transparently
returns a valid, auto-refreshed token from an existing session, so the expensive part (the actual
sign-in) only has to happen once per run of the whole exercise, not once per k6 invocation. The
resulting token was piped directly into `k6 run` (mint immediately followed by test start, chained
in one shell invocation — even the round-trip between two separate commands was enough to burn a
meaningful chunk of the 60s window). All test data (the load-test Clerk user, its local `User`
row and everything it cascade-owned, and the 35 real S3 objects the upload test created) was
deleted afterward.
