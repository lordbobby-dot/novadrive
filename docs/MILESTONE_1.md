# Milestone 1 — Auth & Identity — Completion Notes

## What was built

Auth is delegated to **Clerk** rather than hand-built (see the note at the top of Milestone 1
in [ROADMAP.md](../ROADMAP.md) for the rationale). Wired up via the Clerk CLI (`clerk init`)
for the Next.js side, plus manual NestJS integration since Clerk CLI doesn't scaffold NestJS.

- **`apps/web`**: `@clerk/nextjs` + `@clerk/ui` (shadcn theme applied), `middleware.ts`
  protecting `/dashboard(.*)`, `ClerkProvider` in the root layout, `/sign-in` and `/sign-up`
  pages (Clerk's prebuilt components), `SignInButton`/`SignUpButton`/`UserButton` on the
  landing page, and a `/dashboard` server component that calls the API's `GET /users/me` with
  the Clerk session token.
- **`apps/api`**: `PrismaModule` (global, first real Prisma wiring into Nest — M0 only had the
  schema), `AuthModule` (global: `ClerkAuthGuard`, `ClerkClientProvider`,
  `ClerkWebhookController` at `POST /webhooks/clerk`), `UsersModule` (`User` domain
  entity/repository, `GetCurrentUserUseCase`/`SyncClerkUserUseCase`/`DeleteClerkUserUseCase`,
  `GET /users/me`).
- **Database**: single `User` model (`clerkId`, `email`, `name`, `avatarUrl`) — no
  Session/Device/RefreshToken tables, Clerk owns that state.
- **Defensive lazy sync**: `ClerkAuthGuard` creates the local `User` row on first authenticated
  request if the webhook hasn't landed yet (verified live — see below). The webhook keeps
  profile updates/deletes in sync but isn't load-bearing for the core sign-up flow.

## Deviations from the roadmap plan

- Bumped `react`/`react-dom` from `19.1.0` to `19.2.7` — `@clerk/nextjs@7.5.18`'s peer range
  didn't include `19.1.0`.
- Removed the `svix` dependency originally planned for webhook verification — `@clerk/backend`
  exports `verifyWebhook` directly (`@clerk/backend/webhooks`), which wraps Standard Webhooks
  verification and takes a Fetch API `Request`; no need for a separate svix integration.
- `CLERK_WEBHOOK_SIGNING_SECRET` is configured but the webhook endpoint itself isn't reachable
  from Clerk's servers in local dev (needs a public tunnel — see `docs/clerk-setup.md`). This is
  fine because of the guard's lazy-sync fallback; production deployment will need a real tunnel
  or public URL for the webhook to keep updates/deletes in sync.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- Sign up at http://localhost:3000 (Google OAuth or email/password) → redirected to
  `/dashboard`, which shows your synced profile pulled live from `GET /users/me`.
- Visiting `/dashboard` while signed out redirects to Clerk's sign-in flow.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm --filter api test:e2e` all
  pass.

## Verified in this session

- `clerk doctor` — all green (linked app, valid env keys, no issues).
- Full live browser sign-up flow (using Clerk's `+clerk_test@` testing email pattern + OTP
  `424242`) → landed on `/dashboard` → profile rendered correctly, including a real avatar
  fallback, email, and "Member since" date.
- Confirmed via `docker exec ... psql` that the `User` row was actually created in Postgres
  through the guard's lazy-sync path (no webhook configured yet).
- Confirmed unauthenticated `/dashboard` access redirects to sign-in.
- 17 unit tests + 4 e2e tests passing (`ClerkAuthGuard`, `ClerkWebhookController`,
  `UsersController`, plus the M0 health tests).
- Verified the Next.js production build succeeds both with real Clerk dev keys and with a
  syntactically-valid placeholder key (matching what CI will use).

## Acceptance criteria status

- [x] Signing up (including via Google — configured as a Social Connection in the Clerk
      Dashboard, not tested live here since it requires a real Google OAuth consent flow) and
      signing in both work through Clerk's UI.
- [x] Unauthenticated `/dashboard` redirects to sign-in; unauthenticated `GET /users/me` returns
      401 (covered by the e2e test and the guard's unit tests).
- [x] Signing up creates a matching local `User` row (verified via the lazy-sync fallback, since
      the webhook isn't reachable from local dev); `/dashboard` renders data from `GET
      /users/me`.
- [x] `ClerkAuthGuard` rejects missing, malformed, and invalid tokens; accepts valid ones
      (5 dedicated unit tests).

Milestone 1 is production-ready modulo two things only you can do: (1) configure the Clerk
webhook endpoint against a real public URL when you deploy, and (2) add your own Google/GitHub
OAuth credentials in the Clerk Dashboard for production (dev currently uses Clerk's shared
credentials). Awaiting your confirmation before starting Milestone 2 (Core Drive Data Model).
