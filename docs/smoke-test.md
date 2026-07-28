# Smoke Test

[`scripts/smoke-test.sh`](../scripts/smoke-test.sh) is a fast, dependency-free (`bash` + `curl`
only) check that a freshly deployed NovaDrive stack is actually up and wired correctly. It's the
acceptance check referenced in the roadmap's Milestone 16 criteria — run it against any new
deployment before considering it live.

It deliberately only exercises **unauthenticated, side-effect-free** endpoints. It is not a
substitute for the real test suites — `apps/api`'s unit/e2e tests and `apps/web`'s Playwright
suite (see [`docs/testing-strategy.md`](testing-strategy.md)) already cover application
correctness; this script answers a narrower, deployment-specific question: *is this environment's
plumbing connected* — containers up, reachable on the expected ports, talking to Postgres/Redis/S3,
serving the right build.

## Usage

```bash
# Against docker-compose.prod.yml's default host ports (local prod-mode smoke test):
./scripts/smoke-test.sh

# Against a real deployment:
API_URL=https://api.example.com WEB_URL=https://app.example.com ./scripts/smoke-test.sh
```

Exits `0` if every check passes, non-zero otherwise — safe to wire into a deploy pipeline as a
post-deploy gate.

## What each check verifies

| Check | Verifies |
|---|---|
| `GET /health` | The `api` process is up and responding at all (liveness only — see [`docs/observability.md`](observability.md#health-checks)). |
| `GET /health/ready` — overall | The readiness endpoint itself responds `200`. |
| `GET /health/ready` — `database`/`redis`/`s3` up | Each of the three real dependencies the API needs is actually reachable — the readiness endpoint reports each independently, so this catches e.g. "API is up but can't reach Postgres" (wrong `DATABASE_URL`, migration container failed, network issue) distinctly from an S3 credentials problem. |
| `GET /metrics` | The Prometheus metrics endpoint is exposed and returning real metric names — confirms monitoring can actually be wired up against this deployment. |
| `GET /` (web) | The `web` container is up, serving the real app (not a blank page or a misconfigured reverse-proxy default page) — checked by looking for "NovaDrive" in the response body. |
| `GET /sign-in` (web) | The Clerk publishable key was baked into the build correctly at build time and the sign-in route renders — a `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` build-arg that was missing or wrong at build time (see [`docs/deployment.md`](deployment.md#building-the-images)) tends to surface here first. |

## Reading a failure

- **Every check fails, including `GET /health`:** `api` container isn't running, isn't reachable at
  `API_URL`, or a reverse proxy/firewall in front of it is misconfigured. Start with
  `docker compose -f docker-compose.prod.yml ps` and `docker compose -f docker-compose.prod.yml logs api`.
- **`GET /health` passes but `/health/ready` fails on one dependency:** see the matching entry in
  [`docs/deployment.md`](deployment.md#incident-runbook)'s incident runbook (queue backlog, S3
  throttling, and DB connection exhaustion are the three most likely causes covered there — a fresh
  deploy failing readiness is usually the DB one, e.g. the `migrate` one-off job never completed
  successfully so `api` started against an unmigrated schema, or `DATABASE_URL` is wrong).
- **API checks all pass but web checks fail:** `web` container issue, independent of the API —
  check `docker compose -f docker-compose.prod.yml logs web`. If `/sign-in` specifically 404s or
  errors while `/` works, re-check the Clerk build-args were actually passed to `docker build`.
- **`000` status shown for any check:** `curl` itself couldn't connect (DNS failure, connection
  refused, timeout) — distinct from an HTTP-level failure (e.g. `503`), and points at network/DNS/
  port-mapping rather than an application bug.
