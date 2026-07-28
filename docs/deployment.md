# Deployment

How to build and run NovaDrive's production images, what each env var is for, and an incident
runbook for the failure modes most likely to actually happen. Scope, per the roadmap: a working
single-host/Compose deployment with production-shaped Docker images — Kubernetes/Helm are
explicitly out of scope here (see [`ROADMAP.md`](../ROADMAP.md)'s Milestone 16 section for why).

## Architecture

Two application images (`apps/api`, `apps/web`), each built from its own multi-stage `Dockerfile`
at the repo root of that app. Both use [`turbo prune <app> --docker`](https://turborepo.com/docs/reference/prune)
to extract just the workspace packages that app actually depends on before installing, so neither
image carries the other app's dependencies or source.

```
                        ┌────────────┐
   browser ───────────► │    web     │  Next.js standalone server, port 3000
                        └─────┬──────┘
                              │ REST — two different base URLs depending on which side of the
                              │ container boundary is making the call (see note below)
                        ┌─────▼──────┐
                        │    api     │  NestJS, port 4000
                        └──┬───┬───┬─┘
                           │   │   │
                    ┌──────┘   │   └───────┐
              ┌─────▼───┐ ┌────▼────┐ ┌────▼────┐
              │ postgres│ │  redis  │ │ clamav  │
              └─────────┘ └─────────┘ └─────────┘
                                            │
                                       (S3: always real AWS,
                                        never containerized)
```

`postgres` and `redis` are run as containers in `docker-compose.prod.yml` for a self-contained
reference deploy, but the roadmap's own guidance is to treat that as a placeholder for managed
services (RDS/ElastiCache/Upstash/etc.) in a real production environment — swap `DATABASE_URL` /
`REDIS_HOST` to point at the managed service and nothing else changes. S3 is real AWS in every
environment this project runs in, including local dev; there is no mock or LocalStack anywhere
(see [`docs/aws-setup.md`](aws-setup.md)).

**Two base URLs for the API, not one.** `apps/web` talks to `apps/api` from two different places
that resolve `localhost` differently:

- The **browser** calls the API using `NEXT_PUBLIC_API_URL` — baked into the client JS bundle at
  `next build` time (see Building the images, below), pointing at `API_ORIGIN` (a host-published
  address like `http://localhost:4000` or a real public API domain).
- **Server Components** (`app/drive/page.tsx`, `app/dashboard/page.tsx`) run their `fetch()` calls
  *inside the `web` container itself* — for them, `localhost`/`API_ORIGIN` means the `web`
  container, not the `api` container, so that address is simply unreachable from there. These use
  `API_INTERNAL_URL` instead, a runtime-only (not baked in, not `NEXT_PUBLIC_*`) env var hardcoded
  in `docker-compose.prod.yml` to `http://api:4000` — Compose's internal service-name DNS, which
  only resolves inside the Compose network. Both page components fall back to
  `NEXT_PUBLIC_API_URL` then `http://localhost:4000` if `API_INTERNAL_URL` is unset, which is
  exactly correct for local (non-Docker) dev, where `next dev` and `nest start` run as sibling
  processes on the same host and `localhost:4000` genuinely does reach the API.

## Building the images

Each Dockerfile's first stage runs `turbo prune <app> --docker` against the whole monorepo (hence
`context: .` in `docker-compose.prod.yml`, not `context: apps/api`), producing a minimal
`out/json/` (manifests + lockfile, for a cacheable install layer) and `out/full/` (pruned source)
before installing and building. See the comments in
[`apps/api/Dockerfile`](../apps/api/Dockerfile) and [`apps/web/Dockerfile`](../apps/web/Dockerfile)
for the specific ordering constraints each one has (notably: `apps/api`'s Dockerfile runs
`prisma generate` both before `nest build` — the compiled TypeScript references generated model
types — and again as the literal last build step, since `pnpm prune --prod` triggers a full
node_modules reinstall that would otherwise silently discard the generated Prisma client).

```bash
docker build -f apps/api/Dockerfile -t novadrive-api .

docker build -f apps/web/Dockerfile -t novadrive-web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... \
  .
```

`apps/web`'s `NEXT_PUBLIC_*` vars are Next.js **build-time** values — they're inlined into the
client JS bundle by `next build`, so they must be supplied as `--build-arg`s, not just runtime
container env vars. `docker-compose.prod.yml` wires this correctly already (see its `web.build.args`
block); this matters if you ever build the image by hand outside Compose.

Expect image sizes in the ballpark of ~1.2GB (`api`, dominated by the Node/Prisma/OpenSSL runtime
layer) and ~450MB (`web`, thanks to Next's `output: "standalone"` trace-based pruning).

## Scaling notes: BullMQ worker vs. API process

`docker-compose.prod.yml` has two services built from the same image (`apps/api/Dockerfile`), just
with different entrypoints:

- **`api`** — `apps/api/src/main.ts`, `NestFactory.create(AppModule, ...)`. Serves HTTP, and (like
  before this changed) still also runs every BullMQ processor, since it hosts the same
  `AppModule`.
- **`worker`** — `apps/api/src/main-worker.ts`, `NestFactory.createApplicationContext(AppModule, ...)`.
  The *exact same* module graph, started without an HTTP adapter — no port bound, no helmet/CORS/
  ValidationPipe/Swagger setup (that all lives in `main.ts`, not in `AppModule` itself). What does
  start: the four BullMQ `WorkerHost` processors (checksum verification, abandoned-upload cleanup,
  trash cleanup, audit log purge) and their schedulers, unchanged from how they've always run.

Reusing `AppModule` wholesale (rather than hand-building a leaner worker-only module) was a
deliberate choice: `UploadsModule`/`TrashModule`/`AuditModule` each mix queue-producer code (a use
case enqueueing a job) and queue-consumer code (the processor) in one module, and splitting that
apart would be real surgery on tested code for no behavioral benefit. The one thing to know about
reusing `AppModule` this way: `RealtimeModule`'s `RealtimeGateway` (`@WebSocketGateway()`) gets
instantiated as a provider in the worker too, transitively imported via `UploadsModule` — but its
socket.io binding only happens through `NestApplication`'s HTTP-adapter-bound bootstrap sequence,
which `NestApplicationContext` (what `createApplicationContext` returns) never runs. It stays a
harmless, dormant provider rather than erroring for lack of an HTTP server to attach to — verified
by actually booting `main-worker.ts` against real Postgres/Redis before wiring it into this compose
file, not just assumed.

**Both `api` and `worker` end up consuming the same BullMQ queues.** That's fine, not a bug: BullMQ
distributes jobs across every `Worker` instance connected to a given queue via Redis locks, so
nothing gets double-processed. The point of the split is that **job-processing capacity is now
scalable independently of HTTP capacity** —
`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale worker=3` adds
checksum-verification/cleanup throughput without adding more HTTP listeners, and conversely you can
scale `api` for request load without proportionally adding job-processing capacity you don't need.
If a deployment ever wants `api` to stop contributing any processing capacity at all (pure
separation, e.g. for cost isolation), that would mean extracting the processors out of the shared
modules into a worker-only module — not done here, since running both is strictly more resilient
(job processing survives an API outage and vice versa) at no real cost.

`worker` has no HTTP endpoint, so its healthcheck is a process-liveness check (`pgrep -f
main-worker`) rather than the `api` service's `/health` probe — see that service's healthcheck
comment in `docker-compose.prod.yml`.

## Running the stack

```bash
cp .env.prod.example .env.prod   # fill in real values, see below
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This brings up, in dependency order: `postgres` and `redis` (health-checked) → `clamav`
(health-checked, ~5 min `start_period` for virus-definition load) → `migrate` (a one-off job
running `prisma migrate deploy`, which the `api` service waits to *complete successfully*, not
merely start, via `condition: service_completed_successfully`) → `api` → `web`. Every required
secret uses Compose's `${VAR:?message}` syntax, so `docker compose ... config` (or `up`) fails
immediately with a clear message if anything's missing, rather than starting with an empty string.

Once up: `web` is reachable on `${WEB_PORT:-3000}`, `api` on `${API_PORT:-4000}`. Run
[`scripts/smoke-test.sh`](../scripts/smoke-test.sh) (see [`docs/smoke-test.md`](smoke-test.md))
against a fresh deploy before considering it live.

### Env vars

See [`.env.prod.example`](../.env.prod.example) for the full annotated list. Summary by category:

| Category | Vars | Notes |
|---|---|---|
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Only relevant if using the containerized `postgres` service; point `DATABASE_URL` at a managed instance instead in a real deployment and these become irrelevant. |
| Origins | `WEB_ORIGIN`, `API_ORIGIN` | Real, internet-reachable URLs — `WEB_ORIGIN` becomes the API's `CORS_ORIGIN`; `API_ORIGIN` is baked into the web build as `NEXT_PUBLIC_API_URL`. |
| Ports | `WEB_PORT`, `API_PORT` | Host-side port mapping only. |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | Use `pk_live_...`/`sk_live_...`, not the `_test_` keys used in dev — see [`docs/clerk-setup.md`](clerk-setup.md). |
| Admin bootstrap | `ADMIN_BOOTSTRAP_EMAILS` | Optional; comma-separated emails granted admin on Clerk sync — see [`docs/admin.md`](admin.md). |
| AWS S3 | `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Real bucket/credentials — see [`docs/aws-setup.md`](aws-setup.md). |
| Email | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | `EMAIL_PROVIDER` defaults to `console` (invitation emails are just logged, not sent). Set it to `resend` for real delivery — `RESEND_API_KEY`/`EMAIL_FROM` then become required at boot. See [`docs/permissions.md`](permissions.md#invitation-email-addressed-async-accept). |
| Observability | `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | All optional; unset disables each integration entirely rather than erroring — see [`docs/observability.md`](observability.md). |

### Security notes from the env/secret audit

- No hardcoded secrets exist anywhere in source (`apps/api/src`, `apps/web/src`, tests, CI config,
  Dockerfiles, both compose files) — every secret-shaped value in the codebase is either a
  synthetic test fixture (e.g. `sk_test_ci_placeholder_not_a_real_key` in CI) or a required env var
  with no default (`${VAR:?...}` in `docker-compose.prod.yml`).
- The local dev Postgres default (`novadrive`/`novadrive` in `docker-compose.yml`, dev-only) never
  leaks into `docker-compose.prod.yml`, `.env.prod.example`, CI, or any doc as a production value —
  `POSTGRES_PASSWORD` has no fallback in the prod compose file and is required.
- `apps/web/Dockerfile` deliberately does **not** set `CLERK_SECRET_KEY` as a build-time `ARG`/`ENV`
  — confirmed by testing that `next build` succeeds without it (Clerk's secret key is only needed
  server-side at runtime). Avoids both an unnecessary secret in the image's layer history and
  Docker's own `SecretsUsedInArgOrEnv` build lint warning.
- `apps/web/.gitignore`'s blanket `.env*` rule was fixed to exclude `.env.example` (it was
  previously silently un-trackable, unlike the root `.gitignore`'s equivalent `!.env.example`
  exception for `apps/api`) — a tracking gap, not a leak, but worth knowing about if you add new
  example env files under `apps/web`.
- `apps/api/.env.example` and `apps/web/.env.example` were cross-checked against
  `apps/api/src/config/env.validation.ts` and the actual Clerk/Sentry env reads in `apps/web` and
  brought up to date (missing `CLAMAV_HOST`/`CLAMAV_PORT`, `TRASH_RETENTION_DAYS`,
  `DEFAULT_USER_QUOTA_BYTES`/`DEFAULT_ORG_QUOTA_BYTES` on the API side; missing
  `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`/`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
  on the web side).

## Backups

See [`docs/backup-restore.md`](backup-restore.md) — `scripts/backup-db.sh`/`scripts/restore-db.sh`
back up and restore the `postgres` service's database. Not run automatically by anything in this
repo; wire one into a cron job or your platform's scheduled-task equivalent.

## Incident runbook

### Queue backlog (BullMQ jobs piling up — checksum verification or trash cleanup)

**Symptoms:** `queue_depth{state="waiting"}` climbing in `GET /metrics` (see
[`docs/observability.md`](observability.md)) or `GET /admin/system-health`; uploads stuck in a
processing state longer than expected; users reporting files never finish uploading.

1. Check `GET /admin/system-health` (or `/metrics`) for `queue_depth` by `queue`/`state` to confirm
   which queue and whether jobs are `waiting` (not being picked up) vs `failed` (being picked up and
   erroring).
2. If `waiting` is climbing with `active` near zero: nothing is consuming. Check both the `worker`
   and `api` containers' logs/health (both run the same processors — see "Scaling notes" above) —
   `docker compose -f docker-compose.prod.yml ps worker api`. If `worker` is unhealthy/restarting,
   `docker compose -f docker-compose.prod.yml restart worker` after confirming Redis itself is
   healthy (`docker compose -f docker-compose.prod.yml exec redis redis-cli ping`); `api` alone
   being healthy is enough to keep jobs draining even if `worker` is down, just more slowly.
3. If `failed` is climbing: check `worker`/API logs for the correlation ID on failing jobs (see
   [`docs/observability.md`](observability.md#correlation-ids-through-background-jobs)) — a common
   cause is ClamAV being unreachable (`clamav` container unhealthy/still loading definitions) for
   the virus-scan step, or S3 throttling (see next runbook entry) for the checksum-verification
   step's read-back.
4. Once the root cause is cleared, BullMQ's default retry/backoff will drain `failed` jobs back
   through `active` automatically — no manual requeue needed unless a job exhausted its retry limit,
   in which case it stays in `failed` for manual inspection.

### S3 throttling / errors

**Symptoms:** `GET /health/ready`'s `s3` check reporting down; upload-initiate or download-signed-URL
requests failing or slow; `SlowDown` or `503` errors in API logs from AWS SDK calls.

1. Confirm it's actually S3 and not a credentials/config problem: `GET /health/ready` reports
   per-dependency status independently, so if only `s3` is down (not `database`/`redis`), it's
   either genuine AWS-side throttling, a bucket/region misconfiguration, or expired/rotated
   credentials.
2. Check the AWS S3 service health dashboard for the configured `AWS_REGION` first — this project
   has no S3 mock or fallback anywhere, so a real AWS incident presents identically to a config bug.
3. If it's request-rate throttling (`SlowDown`, `503 Slow Down`): S3 request rates scale
   automatically per-prefix over time, so sustained throttling on a young bucket/prefix pattern
   usually self-resolves; it is not a NovaDrive-side bug to fix by retry-storming the same prefix
   harder.
4. If it's a credentials error (`InvalidAccessKeyId`, `SignatureDoesNotMatch`, `AccessDenied`):
   verify `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in `.env.prod` match a currently-active IAM
   user with the policy documented in [`docs/aws-setup.md`](aws-setup.md), and that the key hasn't
   been rotated/deleted in the AWS console without updating `.env.prod`.
5. Restart `api` after rotating credentials (env vars are read once at process start, not
   hot-reloaded): `docker compose -f docker-compose.prod.yml up -d --force-recreate api`.

### Database connection exhaustion

**Symptoms:** `GET /health/ready`'s `database` check reporting down; API logs showing Prisma
`P2024` (timed out fetching a connection from the pool) or Postgres-side `FATAL: too many
connections`.

1. Confirm via `GET /health/ready` that `database` specifically is down (not a broader Postgres
   outage) — if `redis`/`s3` are still up, the process itself is healthy, just starved for DB
   connections.
2. Check active connection count against Postgres's `max_connections`:
   `docker compose -f docker-compose.prod.yml exec postgres psql -U ${POSTGRES_USER:-novadrive} -c "SELECT count(*) FROM pg_stat_activity;"`
   compared against `SHOW max_connections;`.
3. This deployment normally runs a single `api` container, so exhaustion here usually means a
   connection leak (each Prisma request should release back to the pool; check for long-running
   transactions in logs) or a genuine traffic spike outstripping the pool size — **unless**
   `worker` was recently scaled up (`docker compose ... up -d --scale worker=N`, see "Scaling
   notes" above): each `worker` replica hosts the same `AppModule`/Prisma connection pool as `api`,
   so a large `worker` fleet is a legitimate, easy-to-overlook contributor to connection count.
4. If using the containerized `postgres` reference service: consider whether it's sized adequately
   for the load (`postgres:16-alpine`'s defaults are conservative). If using a managed service
   (recommended for real production, per the Architecture section above), check that service's own
   connection-limit metrics and consider a connection pooler (e.g. PgBouncer) in front of it if the
   application's needs exceed a direct-connection budget — not currently part of this stack.
5. Restart `api` to release any leaked connections as an immediate mitigation while investigating
   the root cause: `docker compose -f docker-compose.prod.yml restart api`.

### Data loss / corruption requiring a restore

**Symptoms:** a bad deploy or manual error corrupted or deleted data at the database level (not
individual user-facing deletes, which already go through Trash — see
[`docs/permissions.md`](permissions.md#trash-stays-owner-private) — but something below that, like
a botched migration or direct DB surgery).

1. Stop `api`/`worker`/`web` first so nothing keeps writing during the restore:
   `docker compose -f docker-compose.prod.yml stop api worker web`.
2. Follow [`docs/backup-restore.md`](backup-restore.md) — `./scripts/restore-db.sh
   <most-recent-good-dump>`. This is destructive (drops and recreates every object first); confirm
   you have the right dump before confirming the prompt.
3. If the dump predates the current schema, run `docker compose -f docker-compose.prod.yml up
   migrate` to bring it forward before starting `api` again.
4. Bring the rest of the stack back up: `docker compose -f docker-compose.prod.yml up -d api worker
   web`, then run [`scripts/smoke-test.sh`](../scripts/smoke-test.sh) before considering it live
   again.
5. Whatever changed between the backup's timestamp and the incident is gone — this is why
   `docs/backup-restore.md`'s retention/off-host guidance and periodic restore drills matter more
   than the restore mechanism itself.
