# Milestone 0 — Foundation & Tooling — Completion Notes

## What was built

- Turborepo + pnpm workspace monorepo: `apps/{web,api}`, `packages/{ui,types,sdk,config}`,
  `shared/`.
- `apps/api`: NestJS 11, clean-architecture folder convention established per feature module
  (`modules/<name>/{domain,application,infrastructure,interface}` — only `interface` populated
  so far since `health` has no domain logic), Helmet, CORS from env, global `ValidationPipe`,
  Swagger at `/api/docs`, zod-validated env config (`AppConfigModule`), `GET /health`.
- `apps/web`: Next.js 15 (App Router) + React 19, Tailwind v4, shadcn/ui (`base-nova` style,
  neutral base color), dark/light/system theme via `next-themes`, React Query provider, Zustand
  UI store scaffold, landing page that live-queries the API's `/health` endpoint.
- `docker-compose.yml`: Postgres 16 + Redis 7 for local dev. S3 is real AWS in every
  environment — see `docs/aws-setup.md`.
- Prisma initialized against Postgres with a placeholder `HealthCheck` model, first migration
  applied, `prisma.config.ts` (not the deprecated `package.json#prisma` field — avoids known
  Prisma 7 deprecation).
- GitHub Actions CI (`.github/workflows/ci.yml`): install → lint → typecheck → prisma
  generate/migrate → unit tests → API e2e tests → build, with Postgres/Redis service containers.

## Deviations from the roadmap plan

- **Next.js pinned to major version 15**, not "latest" (which resolved to Next 16 at scaffold
  time) — the tech stack spec explicitly called for Next.js 15.
- **`packages/ui` is an empty placeholder.** shadcn generated its components directly into
  `apps/web/src/components/ui` since there is only one frontend consumer today; extracting into
  the shared package is deferred until a second consumer actually needs it, per the
  no-premature-abstraction principle.
- **Prisma stayed on 6.x**, not upgraded to the newly-available Prisma 7 major, to avoid
  absorbing an unrelated breaking-change migration in the same milestone that only introduces a
  placeholder model. Worth revisiting once real domain models land and Prisma 7 has had more
  time in the wild.
- Root-level `domain/application/infrastructure` folders were **not** created at the top of
  `apps/api/src` — the clean-architecture split is per feature module instead (e.g. future
  `modules/auth/{domain,application,infrastructure,interface}`), which is what the milestone
  descriptions for M1+ actually describe.

## How to verify locally

```bash
docker compose up -d
pnpm install
pnpm --filter api prisma:migrate
pnpm dev
```

- http://localhost:3000 loads, shows a live "API: healthy (ok)" pill, dark/light toggle works
  with no flash of unstyled content.
- http://localhost:4000/health returns `{"status":"ok","timestamp":"..."}`.
- http://localhost:4000/api/docs loads Swagger UI.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm --filter api test:e2e` all
  pass (verified in this session).

## Acceptance criteria status

- [x] `pnpm dev` boots both apps; web calls api `/health` and renders "API: healthy".
- [x] `docker compose up` brings up Postgres + Redis cleanly; `prisma migrate dev` succeeds.
- [x] CI pipeline configured (lint/typecheck/test/e2e/build) — will go green on first push.
- [x] Dark/light mode toggle works (verified in-browser; persistence via `next-themes`'
      localStorage + `system` default is standard behavior, not manually re-verified here).

Milestone 0 is production-ready as a foundation. Awaiting your confirmation before starting
Milestone 1 (Auth & Identity).
