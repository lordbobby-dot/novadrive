# Milestone 16 — Deployment Readiness — Completion Notes

This is the final milestone in [`ROADMAP.md`](../ROADMAP.md).

## What was built

- **`apps/api/Dockerfile`**: multi-stage production build using `turbo prune api --docker` to
  extract just this app's actual dependency-graph packages from the monorepo, then install/build/
  prune to a minimal `node_modules`, then a slim runtime stage. Final image: **1.21GB**.
- **`apps/web/Dockerfile`**: same `turbo prune`-based pattern plus Next.js's `output: "standalone"`
  build mode (added to `apps/web/next.config.ts`) for a self-contained, dependency-traced server
  bundle. Final image: **452MB**.
- **`docker-compose.prod.yml`**: brings up `postgres`, `redis`, `clamav`, a one-off `migrate` job
  (`prisma migrate deploy`, which `api` waits to *complete successfully* before starting — not
  merely start), `api`, and `web` on a single host. Every secret uses `${VAR:?message}` syntax so
  the stack refuses to start with a missing required value rather than silently running
  misconfigured.
- **`.env.prod.example`**: every var `docker-compose.prod.yml` reads, documented by section.
- **Env/secret audit**: no hardcoded secrets anywhere in source, tests, CI config, or either
  Dockerfile — verified by a targeted search across `apps/api/src`, `apps/web/src`, tests,
  `.github/workflows/`, and both compose files. Found and fixed two real (non-security) gaps: (a)
  `apps/web/.gitignore`'s blanket `.env*` rule was silently excluding `apps/web/.env.example` from
  being trackable, unlike the root `.gitignore`'s equivalent exception for `apps/api`'s example
  file; (b) both `.env.example` files were missing a few vars that the app actually reads
  (`CLAMAV_HOST`/`PORT`, `TRASH_RETENTION_DAYS`, `DEFAULT_USER_QUOTA_BYTES`/
  `DEFAULT_ORG_QUOTA_BYTES` on the API side; the two Clerk fallback-redirect-URL vars on the web
  side) — all now documented in the respective example files.
- **`docs/deployment.md`**: architecture, build/run instructions, the full env var reference, a
  "scaling notes: BullMQ worker vs. API process" section (the roadmap's own named documentation
  requirement), and an incident runbook for queue backlog, S3 throttling, and DB connection
  exhaustion.
- **`scripts/smoke-test.sh`** + **`docs/smoke-test.md`**: a dependency-free (`bash`+`curl`) post-
  deploy check hitting `/health`, `/health/ready` (per-dependency detail), `/metrics`, and the
  web app's home/sign-in pages — 8 checks, all pass/fail independently with a clear summary line.

## Scope decisions and judgment calls

1. **No separate BullMQ worker container.** The roadmap's acceptance criteria list "API, web,
   BullMQ worker, Postgres, Redis" as the stack to bring up, but `apps/api` has never had a second
   process entrypoint — its BullMQ processors have run in-process with the HTTP server since they
   were first added in Milestones 3/6/9. This milestone's scope is explicitly "no product code
   changes — packaging and config only," so introducing a new worker entrypoint to split them apart
   would itself be exactly the kind of product-code change this milestone excludes. Documented the
   real consequence (API and worker scale/fail together) and the concrete future path (a second
   Nest bootstrap entrypoint, module-graph reused, HTTP adapter excluded) in `docs/deployment.md`'s
   new "Scaling notes" section, rather than silently building it or silently ignoring the gap.
2. **Postgres/Redis remain containers in `docker-compose.prod.yml`, per the roadmap's own
   instruction** — explicitly a reference/single-host stand-in for managed services (RDS/
   ElastiCache/etc.) in a real deployment, not a recommendation to run them this way at real scale.
   `DATABASE_URL`/`REDIS_HOST` are the only things that change to point at a managed service
   instead; nothing else in either Dockerfile or the `api`/`web` service definitions needs to.
3. **The Prisma-client-gets-wiped-by-pruning bug (both `pnpm deploy --prod` and
   `pnpm prune --prod` were tried and both silently discarded the generated client) was diagnosed
   through direct, repeated `docker build`/`docker run` testing, not guessed at.** Fixed by
   promoting `prisma` from a dev dependency to a regular one (so it survives a `--prod` prune —
   also needed anyway to run `prisma migrate deploy` from the deployed image) and running
   `prisma generate` a second time, as the literal last build step, after the prune. Documented
   inline in `apps/api/Dockerfile`'s comments with the exact failure this prevents.
4. **A genuine pre-existing bug, unrelated to this milestone's own changes, was found and fixed
   incidentally**: `apps/api/package.json`'s `start:prod` script pointed at `dist/main` instead of
   the real `nest build` output path `dist/src/main` — never caught before because `start:prod` had
   apparently never been exercised in this project (dev always uses `nest start --watch`). Fixed
   both the script and the Dockerfile's `CMD` that would have hit the identical bug.
5. **`CLERK_SECRET_KEY` is deliberately not set as a build-time `ARG`/`ENV` in `apps/web/Dockerfile`**
   — confirmed by testing (`CLERK_SECRET_KEY="" pnpm run build` succeeded locally) that Next.js
   never needs it at build time, only at runtime server-side. Avoids both an unnecessary secret in
   the image's layer history and Docker's own `SecretsUsedInArgOrEnv` build-lint warning, which an
   earlier draft had triggered with an unverified placeholder value.
6. **Kubernetes/Helm, HPA, multi-node orchestration — out of scope**, per the roadmap's explicit
   instruction; this milestone targets single-host/Compose only.

## Architecture notes

- **`turbo prune <app> --docker` works on this repo despite it having zero git commits** (every
  file shows as untracked) — confirmed directly, since it operates on the pnpm workspace/lockfile
  dependency graph via filesystem copy, not git history.
- **pnpm's per-package `node_modules`/`.bin` symlinks live inside each workspace package's own
  directory, not hoisted to the repo root** (e.g. `apps/api/node_modules/.bin/prisma`, confirmed via
  direct container inspection) — both Dockerfiles preserve the full pruned monorepo directory shape
  in the runtime stage rather than cherry-picking subdirectories, since cherry-picking risks
  silently broken symlinks.
- **Next.js `NEXT_PUBLIC_*` vars are inlined into the client bundle at `next build` time**, so
  `docker-compose.prod.yml`'s `web.build.args` (not `web.environment`) is where they're supplied —
  a runtime-only env var would never reach the already-built client JS.

## How to verify locally

```bash
cp .env.prod.example .env.prod   # fill in real values — see docs/deployment.md
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
API_URL=http://localhost:4000 WEB_URL=http://localhost:3000 ./scripts/smoke-test.sh
docker compose -f docker-compose.prod.yml down
```

## Verified in this session

- **Each image built and run standalone** against the real dev Postgres/Redis/S3 stack (via
  `host.docker.internal`) before the full compose stack existed: `apps/api`'s `/health/ready`
  reported all three dependencies genuinely up with real latencies; `apps/web` served the real home
  page, sign-in page, and a static JS chunk, all `200`.
- **The full `docker-compose.prod.yml` stack was brought up as one unit** (`postgres`, `redis`,
  `clamav`, `migrate`, `api`, `web`) via `docker compose -f docker-compose.prod.yml --env-file ...
  up -d --build`, using real AWS S3 credentials and real (test-mode) Clerk keys. Every service
  reported healthy; the one-off `migrate` job ran `prisma migrate deploy` and exited successfully
  before `api` started, confirming the `condition: service_completed_successfully` dependency
  actually gates startup correctly, not just container-start ordering.
- **`scripts/smoke-test.sh` was run against that live stack and initially failed 6 of 8 checks** —
  not because the deployment was broken, but because the script's own `head -n -1` (GNU-only) isn't
  supported by macOS's BSD `head`. Fixed to the portable `sed '$d'` and re-ran: **8/8 passing**,
  confirming `/health`, `/health/ready` (database/redis/s3 all independently reported up),
  `/metrics`, the web home page, and `/sign-in` are all genuinely reachable end to end.
- **Cleaned up after verification**: stack torn down (`docker compose down -v`), the scratch env
  file used to hold real credentials for this local test run was deleted; nothing from this
  verification run was left running or committed.

## Acceptance criteria status

- [x] `docker build` produces working production images for both apps under a defined size
      budget — 1.21GB (`api`) and 452MB (`web`), both verified to actually boot and serve traffic,
      not just build without error.
- [x] `docker-compose.prod.yml` brings up a working stack (API, web, Postgres, Redis — plus
      ClamAV, a pre-existing M9 dependency of the upload pipeline not named in the roadmap's
      original M9-unaware phrasing) on a single host, reachable end-to-end — verified by actually
      running the full stack together, not just `config`-validating the YAML. See the "no separate
      BullMQ worker container" scope decision above for why there's no distinct worker service.
- [x] Smoke-test script passes against a freshly deployed environment — 8/8 checks passing against
      the live compose stack, after fixing one portability bug the verification run itself
      surfaced.

Milestone 16 is complete — this closes out every milestone in `ROADMAP.md`. NovaDrive now has
production-shaped Docker images for both apps, a working single-host Compose deployment, a full
env/secret audit with the resulting gaps fixed, deployment + incident-runbook documentation, and a
verified-working post-deploy smoke test.
