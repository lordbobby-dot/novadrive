# CI/CD

What `.github/workflows/ci.yml` does, what it needs, and what's deliberately deferred. See
[`docs/testing-strategy.md`](testing-strategy.md) for what each test layer covers, and
[`docs/branch-protection.md`](branch-protection.md) for making these checks actually required
before merge (a separate, manual GitHub settings step).

## The `ci` job

Runs on every push/PR to `main`. Clerk auth needs no real secret — every e2e spec mocks
`@clerk/backend`'s `verifyToken` at the module level (see e.g.
`apps/api/test/uploads.e2e-spec.ts`), so the placeholder key in the workflow's `env:` block is
enough. **S3 is different: there is no mock anywhere in this codebase**, so the upload/download/
version e2e specs do a real S3 round-trip and this job requires real `AWS_REGION`/`AWS_S3_BUCKET`/
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` repository secrets — a "Verify AWS secrets are
configured" step fails with a clear message naming exactly which secret is missing, rather than
letting the e2e step fail deep inside an AWS SDK call with a cryptic credentials error. See
`docs/branch-protection.md`'s secrets table for where to add them.

| Step | What it catches |
|---|---|
| `pnpm audit --audit-level=high` | Known high/critical CVEs in dependencies. |
| `pnpm lint` / `pnpm typecheck` | Style/type regressions across the whole monorepo. |
| Migration drift check (`prisma migrate diff --exit-code`) | Someone edited `schema.prisma` without generating a matching migration — `prisma migrate deploy` alone wouldn't catch this, since it only applies migrations that already exist; it can't tell the datamodel and the migration history disagree. |
| `prisma migrate deploy` | The committed migrations actually apply cleanly to a fresh database. |
| `pnpm --filter api test:cov` | Unit tests, with coverage collected (not gated on a threshold — see `docs/testing-strategy.md`'s reasoning for coverage-as-signal, not coverage-as-target). |
| `pnpm --filter api test:e2e` | Integration/e2e tests against real Postgres/Redis/S3/ClamAV. |
| `pnpm build` | Both apps actually build. |
| `pnpm --filter api openapi:dump` + `pnpm --filter web contract:check` | `apps/web`'s API calls haven't drifted from `apps/api`'s real surface. |

Service containers: Postgres, Redis, and (new this milestone) ClamAV — the upload pipeline's
virus-scan step needs a real clamd to talk to; without it, any e2e spec touching the EICAR
quarantine flow either fails or silently exercises a code path that never actually scans anything.

## The `playwright` job

Same test/build/service-container shape, plus building and starting the API in the background so
`apps/web`'s server components (which call the real API) have somewhere to call. **Conditionally
skips itself** (`if: ${{ secrets.E2E_CLERK_SECRET_KEY != '' }}`) rather than failing, because it
needs real Clerk **test**-instance credentials the committed workflow deliberately doesn't (and
shouldn't) include:

- `E2E_CLERK_SECRET_KEY`, `E2E_CLERK_PUBLISHABLE_KEY` — a real `sk_test_.../pk_test_...` pair.
- `E2E_CLERK_USER_EMAIL` (must contain `+clerk_test`), `E2E_CLERK_USER_PASSWORD` — see
  `apps/web/e2e/README.md` for exactly why a password is collected but never used to sign in.

Add these under **Settings → Secrets and variables → Actions** to turn this from a documented
no-op into a real check.

## Dependency vulnerability scanning

`.github/dependabot.yml` (separate from `ci.yml` — it's a GitHub-native scheduled check, not a
workflow job) runs weekly across three ecosystems: `npm` (the whole pnpm workspace via a single
root entry — Dependabot parses `pnpm-workspace.yaml` itself, so `apps/*`/`packages/*`/`shared`
don't each need their own entry), `github-actions` (this workflow's own action versions), and
`docker` (`apps/api/Dockerfile` and `apps/web/Dockerfile`, one entry each since Dependabot's
docker ecosystem is scoped per-Dockerfile). Minor/patch npm bumps are grouped into one PR per run;
major bumps and everything else stay individual, so nothing risky gets bundled into a PR that
looks routine. See [`docs/security.md`](security.md#owasp-top-10-2021-checklist) (A06).

## What's deliberately not in this workflow yet

**Docker image build + push on merge to main.** The roadmap places this in Milestone 15's CI/CD
section, but the Dockerfiles it would build are themselves Milestone 16's explicit deliverable
("Production Dockerfiles (multi-stage, minimal final images) for `apps/api` and `apps/web`") —
none exist in this repo yet. Wiring a build+push step against Dockerfiles that don't exist would
be broken CI, not a head start; this is deferred to Milestone 16 rather than half-built now. When
those Dockerfiles land, the natural shape is a third job (`docker`, gated on `github.ref ==
'refs/heads/main'` and `github.event_name == 'push'`, i.e. only on merge, not every PR) that builds
and pushes to GHCR using `docker/build-push-action`.

**Coverage thresholds.** `test:cov` collects coverage but nothing fails the build on a percentage
dropping — see `docs/testing-strategy.md`'s reasoning for treating coverage as a diagnostic
signal (used in this milestone's own gap audit) rather than a gate a future PR could game by
padding trivial getter tests.

**Visual regression.** Named an optional stretch goal in the roadmap; no baseline exists to diff
against, so there's no meaningful check to add yet.
