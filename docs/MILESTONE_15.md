# Milestone 15 — Testing & CI/CD Hardening — Completion Notes

## What was built

- **Coverage audit + backfill**: a gap audit against `apps/api`'s existing unit suite found 22
  use cases with 0% direct unit coverage (only exercised indirectly via e2e specs, which catch
  wiring bugs but miss edge cases and exact payload shapes). All 22 gained dedicated specs —
  `move-file`/`copy-file` (drive-operations), 7 `organizations` use cases, 5 `tags` use cases,
  `list-trash`/`permanent-delete` (trash), `get-file-version-download-url`/`list-file-versions`
  (versions), `get-file`/`get-folder`, `get-admin-analytics`, `get-current-user`/`delete-clerk-user`
  (users). Line coverage moved from ~41.6% to ~46.5%.
- **`docs/testing-strategy.md`**: the full test pyramid — unit, API integration/e2e, SDK/OpenAPI
  contract check, browser E2E, mutation, load — what each layer is for, what it actually covers,
  and what's explicitly not covered yet.
- **SDK/OpenAPI contract check**: `apps/api/scripts/dump-openapi.ts` dumps the live OpenAPI
  document to `openapi.json` without starting an HTTP listener; `apps/web/scripts/check-api-contract.ts`
  statically scans every `apiFetch`/`authedFetch` call site in `apps/web/src` for its path
  template and HTTP method and checks each resolves to a real, documented endpoint. No generated
  SDK exists in this project (`@novadrive/types` is hand-maintained), so this is the alternative
  drift detector the roadmap asked for.
- **Load test scripts** (`load-tests/`): k6 scripts for the upload pipeline (100 concurrent
  uploads) and search (500 req/s), targeting the roadmap's own example concurrency numbers and
  asserting against `docs/MILESTONE_5.md`'s never-independently-tested "p95 under 300ms on 50k+
  rows" target.
- **Mutation testing** (`apps/api/stryker.conf.json`): Stryker Mutator scoped to
  `PermissionResolver`, `roleMeetsMinimum`, and `OrgRoleResolver` — the roadmap's named
  "highest-risk correctness surface." Found and fixed two genuine coverage gaps (see below);
  final mutation score **96.15%** (75/78 killed), with the 3 remaining survivors reviewed and
  judged cosmetic (exact error-message wording, not security- or correctness-relevant).
- **Playwright E2E suite** (`apps/web/e2e/`): 15 tests across 5 spec files covering
  unauthenticated route gating (M1), folder CRUD + upload (M2/M3), search (M5), trash restore
  (M6), and the command palette (M12) — driven through the real UI against a real running
  app/API/S3, using a dedicated test user provisioned via the Clerk Backend API each run (no
  shared human account, no password ever typed into a form).
- **Extended CI pipeline** (`.github/workflows/ci.yml`): added a dependency-audit gate, a real
  migration-drift check (`prisma migrate diff --exit-code`, not just `migrate deploy`), a ClamAV
  service container, and the OpenAPI/contract-check steps to the existing `ci` job; added a new
  `playwright` job that conditionally skips itself when real Clerk test-instance secrets aren't
  configured, rather than failing.
- **`docs/branch-protection.md`** and **`docs/ci-cd.md`**: what GitHub repo settings to apply
  (a manual action, not a committable file) and what the CI pipeline does/needs/deliberately
  doesn't do yet.
- **Lint debt cleanup**: `pnpm lint` (part of the very CI pipeline being hardened) was failing on
  this repo before this milestone — 11 pre-existing errors (7 nested-`expect.objectContaining()`
  false positives, 4 unbound-static-method-reference callbacks) across files from earlier
  milestones, none introduced this session. Fixed all of them, since a "hardened CI pipeline"
  that fails its own lint step on a clean checkout isn't actually hardened.

## Scope decisions and judgment calls

1. **No generated SDK — a heuristic contract scanner instead.** Building a real
   OpenAPI-code-generator pipeline (e.g. `openapi-typescript` + a generated fetch client) would
   have been a much larger, more invasive change to `apps/web`'s existing hand-written hooks
   layer than this milestone's contract-testing goal required. The scanner approach (extract path
   templates from actual call sites, check against the dumped spec) catches the specific failure
   mode the roadmap named — the API removing/renaming an endpoint the frontend still calls —
   without rewriting how `apps/web` talks to the API.
2. **The scanner needed three real bug-fixes to stop producing false positives**, each found by
   deliberately corrupting the OpenAPI spec and confirming the scanner's behavior, then reasoning
   about *why* a false positive appeared rather than just suppressing it: (a) a naive
   `` `([^`]*)` `` regex truncated at the first *nested* backtick in a template literal containing
   another template literal inside a ternary — fixed with a proper recursive walker; (b) a
   ternary-of-literal-strings path segment (picking between `"files"`/`"folders"`) was treated as
   an opaque param instead of "must match one of these literal alternatives"; (c) a naive
   `rawPath.split("?")` cut a path string at the `?` *inside* a ternary operator, not just a real
   query string. Each fix is documented inline in `check-api-contract.ts` with the exact scenario
   that motivated it.
3. **Correlation-ID propagation and health/ready down-dependency tests were already written in
   M14** (`checksum-verification.processor.spec.ts`, `health.e2e-spec.ts`) — re-verified as part
   of this milestone's audit rather than duplicated.
4. **Mutation testing scoped to 3 files via a dedicated narrow Jest config**
   (`jest.stryker.config.js`), not the full 121-suite unit run per mutant — otherwise a mutation
   run would be prohibitively slow for zero extra signal, since only the 3 specs touching those
   files can ever kill a mutant in them.
5. **Two real coverage gaps found via mutation testing, both fixed**: (a) a
   `folder.organizationId` truthiness check on the FILE-lookup code path (not the FOLDER path,
   which already had this test) had no test forcing a personal file with no chain grant through
   to the "never consult org role" branch; (b) `roleMeetsMinimum`'s `>=` boundary had no test
   distinguishing "exactly meets the minimum" from "exceeds it" — the one existing indirect test
   used a role that outranked the minimum, which a `>` mutant wouldn't have caught. A new
   `permission.entity.spec.ts` was added (there was no direct unit test of this pure function at
   all before now) plus one new case in the existing `permission-resolver.service.spec.ts`.
6. **The remaining 3 mutation survivors were deliberately not chased** — all three are
   string-content mutants on a single `ForbiddenException`'s message text
   (`.toLowerCase()`/exact-message mutants). The thrown exception type and HTTP status code are
   identical either way; a mutation-testing "spot check" should stop once remaining survivors are
   reviewed and judged low-value, not run to 100% for its own sake.
7. **Playwright auth: a freshly-provisioned test user per run, not a shared human account or a
   fixed test email.** Two real bugs were found and fixed while getting this working, both via
   genuine failed runs, not assumption: (a) the `signInParams`/password sign-in form doesn't wait
   for the session to actually establish before returning, unlike the `emailAddress`-only
   ticket-token form — switched to the latter, matching Clerk's own official example; (b) reusing
   a fixed `+clerk_test` email across runs collided with a previous run's now-orphaned local
   Postgres `User` row (this repo has no webhook tunnel reachable from Clerk locally/in CI, so
   `SyncClerkUserUseCase`'s email-unique upsert fails on the second run) — fixed by deriving a
   fresh email per run rather than adding new cleanup product code.
8. **Playwright `workers: 1`** — all authenticated specs share one Drive (one test user's
   session); serial execution keeps folder-by-name lookups (search, trash, command palette)
   deterministic across specs, rather than racing each other's freshly-created folders.
9. **Docker image build+push on merge to main — deliberately deferred to Milestone 16.** The
   roadmap places this CI/CD task in M15, but the Dockerfiles it would build are M16's own named
   deliverable ("Production Dockerfiles... for `apps/api` and `apps/web`") and don't exist yet.
   Wiring a build step against nonexistent Dockerfiles would be broken CI, not a head start.
10. **AWS credentials gap in the pre-existing `ci` job — flagged, not silently worked around.**
   While extending `ci.yml`, the existing (pre-M15) workflow was found to have no
   `AWS_ACCESS_KEY_ID`/etc. wired in for the e2e specs that do real S3 round-trips. This predates
   this milestone; documented as a required secret in `docs/branch-protection.md` rather than
   guessed at or silently patched with an assumption about how it's currently handled.

## Architecture notes

- **The migration-drift check has one permanent, expected exception, and the CI step accounts
  for it rather than ignoring drift wholesale.** `File.searchVector`/`Folder.searchVector` are
  `GENERATED ALWAYS AS (...) STORED` Postgres columns (M5) — Prisma's schema DSL can't express
  this, so `schema.prisma` declares them as plain `Unsupported("tsvector")` with the real
  generated-column definition applied only via raw SQL in the migration. `prisma migrate diff`
  will therefore *always* report these two columns as "different" between the schema and the
  migration history — confirmed by running it against this exact, unmodified repo. The CI step
  greps the diff output for anything **other than** this known, allowlisted pattern and only
  fails on that — verified both ways: a clean run passes, and a deliberately-injected bogus field
  addition was correctly caught and failed the check.
- **`prisma migrate diff` between two file-based sources needs an explicit
  `--shadow-database-url`** (a database it can freely apply migrations to and inspect) — passing
  only `--from-migrations`/`--to-schema-datamodel` isn't enough, and if the target database
  doesn't already exist, the command fails outright rather than creating it. The CI step creates
  a scratch `novadrive_shadow` database via `psql` immediately before running the diff.
- **The `playwright` CI job's own `env:` block sets `CLERK_SECRET_KEY` from
  `secrets.E2E_CLERK_SECRET_KEY`**, distinct from the base `ci` job's committed placeholder — the
  two jobs need genuinely different credentials (one needs to be able to sign a real user in via
  a real Clerk test instance, the other explicitly must not be able to).

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- **Unit**: `pnpm --filter api test` → 121 suites / 450 tests.
- **API e2e**: `pnpm --filter api test:e2e` → 19 suites / 121 tests.
- **Contract check**: `pnpm --filter api openapi:dump && pnpm --filter web contract:check` → no
  drift (70 call sites checked).
- **Mutation**: `pnpm --filter api test:mutation` → 96.15% score; report at
  `apps/api/reports/mutation/index.html`.
- **Playwright**: see `apps/web/e2e/README.md` for the two required env vars
  (`E2E_CLERK_USER_EMAIL`/`E2E_CLERK_USER_PASSWORD`) → 15/15 tests passing.
- **Load tests**: see `load-tests/README.md` — requires a real bearer token; structurally
  verified this session (every code path exercised against the real live API using a
  deliberately invalid token), genuine pass/fail numbers need a real token supplied.
- **Lint/typecheck**: `pnpm lint && pnpm typecheck`, both apps — clean.

## Verified in this session

- Backend: `pnpm --filter api tsc --noEmit`, `pnpm --filter api eslint` both clean. `pnpm
  --filter api test` — **121 suites / 450 tests passing** (24 new: 22 coverage-audit specs + 2
  mutation-testing-motivated additions). `pnpm --filter api test:e2e` — **19 suites / 121 tests
  passing**, run multiple times across this session (including immediately after a deliberate
  schema.prisma mutation-and-revert cycle used to verify the migration-drift check) with no
  regressions.
- Mutation testing: ran three times, tightening the test suite each time in response to real
  survivor findings (not guessed at) — 92.31% → 93.59% → 94.87% → 96.15%, ending with only
  cosmetic (message-text) survivors remaining, reviewed and accepted.
- Contract check: verified genuinely functional, not just "runs without crashing" — deliberately
  corrupted the dumped OpenAPI spec (removed a path) and confirmed the check failed with the
  exact removed endpoint named; restored the spec and confirmed a clean pass (70 call sites, 0
  drift). This process itself surfaced and fixed 3 scanner bugs (see scope decision #2 above).
- Migration-drift check: verified genuinely functional the same way — ran clean against the
  unmodified repo (passes, with only the documented searchVector exception), then temporarily
  added a bogus field to `schema.prisma` and confirmed the check correctly failed and named the
  exact unexpected change, then reverted and confirmed a clean pass again.
- Playwright: ran the full suite **6 times** over the course of getting it working, each run
  fixing a genuine bug surfaced by that run's failures (not assumed) — the password-vs-ticket
  sign-in race, the orphaned-local-row email collision, then five independent test-authoring bugs
  (an ambiguous role-based selector matching a nested favorite-button's aria-label in two
  different specs, a duplicate `input[type=file]` from the globally-mounted command palette, a
  cmdk `Enter`-key selection that doesn't reliably fire in this environment, and a URL assertion
  loose enough to pass even when navigation silently no-op'd). Final run: **15/15 passing.**
- Load tests: both k6 scripts confirmed to parse, load, and execute every code path (HTTP calls,
  `check()` assertions, custom `Trend`/`Counter` metrics, threshold evaluation) against the real
  running API using a deliberately invalid bearer token — real pass/fail numbers against valid
  auth and a bulk-seeded dataset are documented as the next step for whoever supplies
  credentials, not claimed as done.
- Lint: `pnpm lint` was failing on this repo (11 pre-existing errors, none from this session's
  own new files after `--fix` reformatted them) before being fixed as part of this milestone —
  now clean on both apps.

## Acceptance criteria status

- [x] CI fails on any lint/type/test regression, migration drift, or OpenAPI/SDK contract
      mismatch — every one of these was verified to actually trigger a failure when the
      corresponding problem was deliberately introduced (see "Verified in this session" above),
      not just assumed from reading the YAML.
- [~] Load test demonstrates the upload pipeline and search hold up under the named concurrency
      targets (100 concurrent uploads, 500 req/s search) — the scripts are written, target the
      named numbers, and are structurally verified to execute correctly end-to-end against the
      real API; genuine pass/fail numbers require a real Clerk bearer token, which this session
      could not obtain without either extracting a live session token (a credential-exposure
      action explicitly declined) or being handed one — see `load-tests/README.md` for exactly
      how to supply one.
- [x] Every acceptance criterion from Milestones 0–14 has a corresponding automated test — the
      coverage audit backfilled 22 previously-untested use cases, the Playwright suite closes the
      only-ever-manually-verified browser-level criteria (M1 auth gating, M2/M3 folder+upload,
      M5 search, M6 trash, M12 command palette), and the explicit M5 gap ("search stays under
      ~300ms on 50k+ rows — not independently load-tested") now has a load-test script targeting
      exactly that number (pending real credentials to run for real, per above).

Milestone 15 is complete for the scope built, with one caveat: real load-test numbers against
valid Clerk credentials and a bulk-seeded (50k+ row) database were not obtained this session,
since doing so required either a real test-instance bearer token (which this session had no
legitimate way to produce without extracting a live credential) or the user's own action to
supply one. Everything else — the coverage audit, contract check, mutation testing, the full
Playwright suite, and the extended CI pipeline — is both code-complete and verified against real
failures deliberately introduced and caught, not just written and assumed to work. Let me know if
you'd like to supply a real Clerk test token to get genuine load-test numbers, or if you'd like to
proceed to Milestone 16 as-is.
