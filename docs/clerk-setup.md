# Clerk Setup

NovaDrive delegates authentication entirely to [Clerk](https://clerk.com) — see the note at the
top of Milestone 1 in [ROADMAP.md](../ROADMAP.md) for why. This doc covers what you need to
configure in the Clerk Dashboard and locally to get sign-up/sign-in working end to end.

## 1. Create (or reuse) a Clerk application

This project was wired up via the Clerk CLI (`clerk init`), linked to an existing Clerk
application. If you're setting this up fresh: create an application at
[dashboard.clerk.com](https://dashboard.clerk.com), choosing Email as an identifier at minimum.

## 2. Enable Google / GitHub Social Connections

In the Clerk Dashboard: **Configure → SSO Connections** → enable Google and GitHub. Clerk's
shared OAuth credentials work out of the box in development; for production, add your own
Google/GitHub OAuth app credentials there (not in NovaDrive's codebase — there is no Passport
strategy code in this repo, it's entirely Dashboard-configured).

## 3. API keys

**`apps/web/.env.local`** (written automatically by `clerk init`, not committed):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```
These come from **Configure → API Keys** in the Clerk Dashboard.

**`apps/api/.env`** (set manually — the NestJS API is not something `clerk init` configures):
```
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```
`CLERK_SECRET_KEY` is the same secret key as above. `CLERK_WEBHOOK_SIGNING_SECRET` comes from
the webhook endpoint you configure in step 4.

## 4. Webhook endpoint

The API keeps a local `User` row in sync with Clerk via `POST /webhooks/clerk` (see
`apps/api/src/modules/auth/interface/clerk-webhook.controller.ts`). In the Clerk Dashboard:

1. **Configure → Webhooks → Add Endpoint**.
2. URL: `https://<your-api-host>/webhooks/clerk` — for local development this needs a public
   tunnel (e.g. `ngrok http 4000`, or Clerk's own `clerk webhook listen` if available) since
   Clerk's servers can't reach `localhost` directly.
3. Subscribe to: `user.created`, `user.updated`, `user.deleted`.
4. Copy the endpoint's **Signing Secret** into `apps/api/.env` as `CLERK_WEBHOOK_SIGNING_SECRET`.

**You don't strictly need the webhook working for local development.** `ClerkAuthGuard`
lazily syncs a user from Clerk on first authenticated request if no local row exists yet (see
the "Defensive fallback" comment in `clerk-auth.guard.ts`), so sign-up → `/dashboard` works even
without a reachable webhook. The webhook matters for keeping profile updates and account
deletion in sync, and for production.

## 5. Verifying the setup

```bash
clerk doctor
```

Then start both apps (`pnpm dev`), sign up as a test user from the landing page, and confirm:
- You land on `/dashboard` after sign-up.
- The dashboard shows your synced profile (name/email pulled from the local `User` table via
  `GET /users/me`).
- `<UserButton/>` shows your avatar/account menu.

## Why not build our own auth?

See the note at the top of Milestone 1 in the roadmap. Short version: Clerk gives us
production-grade session management, 2FA, passkeys/WebAuthn, device management, and
suspicious-login detection for free — building and maintaining that ourselves would be a large,
security-sensitive undertaking for a solo/small team to own long-term.
