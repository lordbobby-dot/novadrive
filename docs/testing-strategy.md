# Testing strategy

The full test pyramid for NovaDrive as of Milestone 15, why each layer exists, what it actually
covers, and how to run it locally. See [`docs/ci-cd.md`](ci-cd.md) for how these wire into CI.

## The pyramid

| Layer | Tool | Where | What it's for |
|---|---|---|---|
| Unit | Jest | `apps/api/src/**/*.spec.ts` | Domain/application logic in isolation — the bulk of test volume, cheapest to write and run. |
| Integration/e2e (API) | Jest + Supertest | `apps/api/test/*.e2e-spec.ts` | The real app wired together against real Postgres/Redis/S3/ClamAV — HTTP → guard → use case → repository, no mocks below the controller boundary. |
| Contract | Custom script | `apps/web/scripts/check-api-contract.ts` | Every `apiFetch`/`authedFetch` call site in `apps/web` actually exists in `apps/api`'s OpenAPI spec, with the right method. |
| Browser E2E | Playwright | `apps/web/e2e/*.spec.ts` | Full regression through the real UI — auth gating, Drive CRUD, upload, search, trash, favorites, public share links incl. folder browsing, command palette — against a real running app. |
| Mutation | Stryker | `apps/api/stryker.conf.json` | Spot-checks whether the highest-risk correctness surface's (permission resolution) tests would actually catch a real regression, not just execute the code. |
| Load | k6 | `load-tests/*.js` | Throughput/latency under the roadmap's named concurrency targets (100 concurrent uploads, 500 req/s search) — the layers above prove correctness, this proves it holds up under load. |

## Unit tests — `pnpm --filter api test`

Standard Jest unit tests: every dependency mocked via `jest.Mocked<T>`, one file per source file.
**97 → 121 suites this milestone** (see "Coverage audit" below) covering domain entities, resolvers,
and application-layer use cases. Coverage is tracked (`pnpm --filter api test:cov`) but the target
is *meaningful* coverage of business logic, not a line-count percentage — declarative
controllers/DTOs/modules are deliberately left to the e2e layer instead of unit-tested twice.

### Coverage audit (Milestone 15)

A gap audit found 20 use cases with 0% unit coverage — exercised only indirectly via e2e specs,
which catch wiring bugs but not edge cases (e.g. a specific `NotFoundException` branch, or an
event's exact payload shape). All 20 gained dedicated specs this milestone; see the milestone's
own notes (`docs/MILESTONE_15.md`) for the full list. Line coverage moved from ~41.6% to ~46.5% —
the increase is real logic coverage, not padding, since the remaining uncovered lines are
overwhelmingly controllers/DTOs/module-registration files already exercised by e2e specs.

## API integration/e2e tests — `pnpm --filter api test:e2e`

Boots the real `AppModule` (via `Test.createTestingModule`) against real Postgres/Redis/S3/ClamAV
— no repository or guard is mocked (only `CLERK_CLIENT` is DI-overridden in specs that would
otherwise make real Clerk API calls, e.g. banning/unbanning a user). **19 suites / 121 tests.**
Requires `docker compose up` (Postgres, Redis, ClamAV) and real AWS S3 credentials in
`apps/api/.env`.

## SDK/OpenAPI contract check — `pnpm --filter web contract:check`

There is no generated SDK in this project — `@novadrive/types` is hand-maintained. This script is
the alternative: it dumps the API's live OpenAPI document (`pnpm --filter api openapi:dump`,
writing `apps/api/openapi.json`) and statically scans every `apiFetch`/`authedFetch` call site in
`apps/web/src` for its path template and HTTP method, then checks each one resolves to a real,
documented endpoint. It's a heuristic scanner (regex + a hand-rolled template-literal walker), not
a real parser — see the extensive comments in `check-api-contract.ts` for the specific edge cases
it handles (nested template literals, ternary-of-literal-strings path segments, query-string
interpolations) and how each was found by deliberately breaking the spec and confirming the check
caught it, then fixed once each false positive was traced to a real gap in the scanner.

## Browser E2E — `pnpm --filter web test:e2e`

See [`apps/web/e2e/README.md`](../apps/web/e2e/README.md) for the full auth-provisioning story
(a dedicated Playwright test user created via the Clerk Backend API each run, using the
`+clerk_test` convention and a ticket-token sign-in — no shared human test account, no password
ever typed into a form). **15 tests across 5 spec files**, covering:

- Unauthenticated route gating (M1).
- Folder create/navigate/rename, file upload (M2/M3).
- Full-text search finding a just-created item, and the empty-state for a nonsense query (M5).
- Delete → Trash → restore (M6).
- The command palette (⌘K/Ctrl+K) opening and jumping to a folder by name (M12).

Requires both `apps/api` (real Postgres/Redis/S3) and `apps/web` running, plus real Clerk test
keys — this is the one layer that cannot run against placeholder credentials at all.

## Mutation testing — `pnpm --filter api test:mutation`

Stryker Mutator, scoped to `PermissionResolver`, `roleMeetsMinimum`, and `OrgRoleResolver` — the
roadmap's own framing ("highest-risk correctness surface") is a good one: permission resolution is
exactly the kind of logic where a test suite can look thorough (every branch executed) while
missing the *specific value* that would catch a real bug (e.g. an off-by-one in a role-rank
comparison). Scoped to a narrow Jest config (`jest.stryker.config.js`) covering only the 3
relevant spec files, rather than the full 121-spec suite per mutant — otherwise a mutation run
would be prohibitively slow for no extra signal, since only those specs can ever kill a mutant in
those 3 files.

**Result: 96.15% mutation score** (75/78 mutants killed) after two real gaps were found and fixed
(see `docs/MILESTONE_15.md` for exactly which lines and which tests were added). The 3 remaining
survivors are all in a single error message's exact wording (`toLowerCase()`/string-content
mutants on `requireRole`'s `ForbiddenException` message) — cosmetic, not security- or
correctness-relevant, since the thrown exception type and status code are unaffected either way.
Deliberately not chased further; a mutation-testing "spot check" should stop once the remaining
survivors are reviewed and judged low-value, not run to 100% for its own sake.

## Load tests — `k6 run load-tests/*.js`

See [`load-tests/README.md`](../load-tests/README.md) for the full results and how to reproduce
them. Requires a real bearer token (there's no test-auth bypass for load-testing — deliberately,
since building one would be its own security surface) and, for the search test to be a meaningful
proof of the roadmap's "50k+ rows" target, a bulk-seeded database.

Run for real against the local `docker-compose.prod.yml` stack with a genuine 50,000-row dataset:
search comfortably clears the roadmap's p95<300ms target (p95=16.3ms, two orders of magnitude
under budget) once measured at a request rate the app's own `ThrottlerGuard` doesn't reject —
driving the roadmap's literal 500 req/s example from a single test-runner IP instead mostly
measures the global rate limiter (120 req/min per IP, see `docs/security.md`), not search
throughput; see `load-tests/README.md` for why that's a load-testing-methodology question, not a
backend capacity one. The upload pipeline passed 100% of its correctness checks at 35 concurrent
uploads (also rate-limiter-bounded from one IP) with fast per-request latency, but a real,
unexplained ~5.6s wall-clock cost per full initiate→upload→complete cycle that doesn't show up in
any individual request's timing — flagged as a genuine open question in `load-tests/README.md`,
not swept under the rug.

## Everything a milestone's acceptance criteria imply, but this pyramid doesn't cover yet

Documented here rather than silently assumed complete:

- **Visual regression** — the roadmap named this an optional stretch goal; not built. No baseline
  screenshots exist, so there's nothing to diff against yet.
- **A generated OpenAPI-derived SDK** — `@novadrive/types` stays hand-maintained; the contract
  check is a heuristic safety net against drift, not a replacement for a real generated client.
- **Real captured Sentry events** (both apps) — wired correctly (M14) and confirmed to be a true
  no-op when unconfigured, but no real Sentry project was available this session to observe an
  actual event arrive.
