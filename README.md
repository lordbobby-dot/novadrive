# NovaDrive

A modern cloud storage platform — enterprise-grade architecture, built incrementally per the
milestone roadmap in [ROADMAP.md](./ROADMAP.md).

## Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, React Query,
  React Hook Form, Framer Motion, Zustand
- **Backend**: NestJS, PostgreSQL + Prisma, Redis + BullMQ, Socket.io
- **Auth**: [Clerk](https://clerk.com) (identity provider for both apps — see
  [docs/clerk-setup.md](./docs/clerk-setup.md))
- **Storage**: Amazon S3 (metadata only in Postgres — binaries never touch the database)
- **Monorepo**: Turborepo + pnpm workspaces

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Docker (for local Postgres + Redis)
- A Clerk application — see [docs/clerk-setup.md](./docs/clerk-setup.md)
- An AWS account with an S3 bucket — see [docs/aws-setup.md](./docs/aws-setup.md) (S3 is real
  AWS in every environment, including local dev; there is no local S3 emulator)

## Getting started

```bash
pnpm install

# Start Postgres + Redis
docker compose up -d

# Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# fill in apps/api/.env with your Clerk + AWS credentials
# fill in apps/web/.env.local with your Clerk publishable/secret keys
# (clerk init already writes these automatically for apps/web if you use the Clerk CLI)

# Apply database migrations
pnpm --filter api prisma:migrate

# Run everything
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 (Swagger docs at `/api/docs`)

## Monorepo layout

```
apps/
  web/       Next.js frontend
  api/       NestJS backend (clean architecture: domain/application/infrastructure/interface
             per feature module)
packages/
  ui/        Shared component library (currently empty — shadcn components live in apps/web
             until a second frontend consumer justifies extracting them)
  types/     Shared TypeScript types / DTOs
  sdk/       Typed API client for apps/web, generated against the API's OpenAPI spec
  config/    Shared tsconfig/eslint base configs
shared/      Cross-cutting constants shared across apps and packages
```

## Common commands

Run from the repo root (Turborepo fans these out to the relevant workspaces):

```bash
pnpm dev         # run all apps in dev mode
pnpm build       # production build of all apps
pnpm lint        # lint all workspaces
pnpm typecheck   # typecheck all workspaces
pnpm test        # unit/integration tests
pnpm --filter api test:e2e   # API e2e tests (needs Postgres running)
```

## Development roadmap

This project is built milestone by milestone — see [ROADMAP.md](./ROADMAP.md) for the full plan
(architecture, database, backend, frontend, testing, docs, tasks, and acceptance criteria per
milestone). We are currently on **Milestone 2 — Core Drive Data Model**.
