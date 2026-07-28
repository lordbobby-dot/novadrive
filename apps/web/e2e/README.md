# Playwright E2E suite

Full regression suite (Milestone 15) covering acceptance criteria across milestones, driven
through the real UI against a real running app, real Postgres/Redis/S3, and Clerk's test-mode
auth. See [`docs/testing-strategy.md`](../../docs/testing-strategy.md) for how this fits into the
overall test pyramid.

## What's covered

- `unauthenticated.spec.ts` — M0/M1: home page loads, protected routes redirect to sign-in.
- `drive.spec.ts` — M2/M3: folder create/navigate/rename, file upload appearing in the listing.
- `search.spec.ts` — M5: a just-created folder is findable via full-text search; a nonsense query
  shows the empty state, not an error.
- `trash.spec.ts` — M6: deleting an item moves it to Trash; restoring brings it back.
- `favorites.spec.ts` — M12: starring a folder surfaces it on `/drive/favorites`; unstarring
  removes it.
- `shared-link.spec.ts` — M7 + the folder-browsing extension built after M16 (see
  `docs/permissions.md#browsing-a-shared-folder-via-a-public-link`): creating a public link for a
  folder and opening it in a fresh, signed-out browser context renders the folder's real contents,
  not just its metadata. The only spec that uses a second, storageState-less context — every other
  spec runs entirely inside the one authenticated session.
- `command-palette.spec.ts` — M12: ⌘K/Ctrl+K opens the palette and jumps to a folder by name.

## Auth: how it works without a shared human test account

`global.setup.ts` provisions a **dedicated Playwright test user** via the Clerk Backend API,
signs in, and saves the resulting session as `e2e/.clerk/user.json` (gitignored) — every
`authenticated` test reuses that storage state instead of signing in from scratch. `global.teardown.ts`
deletes the test user again once every dependent test has run.

Two details make this run fully unattended, with no human ever typing a password:

1. **The `+clerk_test` email convention.** Clerk's test-mode instances recognize any email
   containing `+clerk_test` and skip real verification (no code is ever emailed) — see
   [Clerk's testing overview](https://clerk.com/docs/guides/development/testing/overview).
2. **Ticket-token sign-in, not password sign-in.** `clerk.signIn({ page, emailAddress })` (from
   `@clerk/testing/playwright`) uses `CLERK_SECRET_KEY` to mint a short-lived backend sign-in
   ticket for that user and completes it programmatically — it does not use a password at all,
   and (unlike the `signInParams`/password form) it correctly waits for `window.Clerk.user` to be
   set before returning. An earlier version of this file used the password form and intermittently
   raced ahead to the next navigation before the session had actually been established — switching
   to the ticket-token form fixed it; this is the same pattern
   [Clerk's own Next.js Playwright example](https://github.com/clerk/clerk-playwright-nextjs)
   uses.

A password is still generated and set on the user (`E2E_CLERK_USER_PASSWORD`) only because Clerk's
`createUser` API requires one — it's never used to actually sign in.

## Required env vars (`apps/web/.env.local`)

```
E2E_CLERK_USER_EMAIL=your-name+clerk_test@example.com   # must contain +clerk_test
E2E_CLERK_USER_PASSWORD=<any strong value you generate>  # only used to satisfy createUser
```

`CLERK_SECRET_KEY` (already required for the app itself) must be a **test** key (`sk_test_...`),
never a live key — `global.setup.ts` throws immediately if the email doesn't contain
`+clerk_test`, as a guard against accidentally running this against a real Clerk instance.

## Running

```bash
pnpm --filter api dev &      # the app's server components call the real API — must be running
pnpm --filter web test:e2e
```

Both the API and a real Postgres/Redis/S3 (`docker compose up`) must be reachable — several
specs create real folders/files. `webServer` in `playwright.config.ts` starts `apps/web`'s own
dev server automatically if one isn't already running; it does **not** start `apps/api`.

**Workers are pinned to 1** (`playwright.config.ts`): every authenticated test shares the one
Clerk test user against one real backend. Running them concurrently was tried and reverted — it
raced the app's lazy per-user provisioning (the root folder is created on that user's first
authenticated request) and tripped the global rate limiter (`ThrottlerGuard`, see
`docs/security.md`), producing flaky "Failed to load your Drive" errors that had nothing to do
with the feature under test.

## Running in CI (GitHub Actions)

`.github/workflows/ci.yml`'s `playwright` job runs this same suite against a real Postgres/Redis/
S3 stack it spins up itself, plus `apps/api` built and started in the background — but it needs
real credentials the committed workflow file deliberately doesn't include. Add these under repo
**Settings → Secrets and variables → Actions**:

| Secret | Maps to |
|---|---|
| `E2E_CLERK_SECRET_KEY` | `CLERK_SECRET_KEY` — must be `sk_test_...`, same constraint as local running above. |
| `E2E_CLERK_PUBLISHABLE_KEY` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — the matching `pk_test_...`. |
| `E2E_CLERK_USER_EMAIL` | `E2E_CLERK_USER_EMAIL` — must contain `+clerk_test`, same as local. |
| `E2E_CLERK_USER_PASSWORD` | `E2E_CLERK_USER_PASSWORD` — same as local, never used to sign in. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` | Real S3 credentials — `drive.spec.ts` uploads a real file, and there's no S3 mock anywhere in this codebase. Shared with the main `ci` job, which requires these unconditionally (see `docs/branch-protection.md`). |

The job checks `if: ${{ secrets.E2E_CLERK_SECRET_KEY != '' }}` and **self-skips** (reports as
skipped, not failed) if the Clerk secrets aren't set — cloning this repo and opening a PR works
without ever configuring Playwright CI, it just won't run this particular check. The AWS secrets
aren't part of that skip condition, since the main `ci` job already requires them; if you've gotten
`ci` to pass, `playwright` has what it needs too. See `docs/ci-cd.md` and
`docs/branch-protection.md` for the full picture across both jobs.

## What was verified this session

Ran against the real local stack (`apps/api` + Docker Postgres/Redis/S3, `apps/web` dev server):
auth setup (user provisioning → ticket-token sign-in → session save) passes reliably. The first
parallel run surfaced a genuine environment issue (concurrent requests from freshly-provisioned
tests tripping the rate limiter / racing lazy provisioning) rather than a test-authoring bug —
fixed by pinning `workers: 1`, documented above rather than silently worked around.
