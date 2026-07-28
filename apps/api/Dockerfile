# Multi-stage production build for apps/api (NestJS), using Turborepo's `prune --docker` to
# extract a minimal, correctly-scoped subset of this pnpm monorepo (just this app + whichever
# workspace packages it actually depends on) before installing/building — see docs/deployment.md
# for the full rationale and how to build/run this image.

FROM node:26-slim AS base
RUN corepack enable
WORKDIR /app

# ---- Prune: extract just what `api` needs from the full monorepo ----
FROM base AS pruner
COPY . .
RUN npx turbo prune api --docker

# ---- Install + build ----
FROM base AS builder
# Prisma's engine binaries need OpenSSL at generate time too, not just at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Needed before `nest build` — TypeScript compilation itself references generated model types
# (e.g. `StorageObject`, `FileVersion`) via `@prisma/client`.
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build
# `pnpm prune --prod` re-resolves/reinstalls node_modules (unlike a plain in-place removal) —
# `@prisma/client`'s generated query engine lives *inside* that same package directory, so the
# prune above's reinstall silently replaces it with the ungenerated stub (confirmed by testing:
# `require('@prisma/client')` failed at runtime without this second generate). `prisma` is a
# regular dependency (not dev) specifically so it survives the prune and can run again here —
# and so `prisma migrate deploy` can also run from this same image at deploy time.
RUN pnpm prune --prod --no-optional
RUN pnpm --filter api prisma:generate

# ---- Runtime ----
FROM node:26-slim AS runner
# openssl: Prisma's engine binaries need it at runtime, not just at generate time (see the builder
# stage). procps: provides `pgrep`, used by docker-compose.prod.yml's `worker` service healthcheck
# — that service has no HTTP endpoint to probe (see apps/api/src/main-worker.ts), so process
# liveness is the signal instead. Harmless on the `api`/`migrate` images that don't use it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl procps && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nestjs
WORKDIR /app

# The pruned monorepo's directory shape (root node_modules + apps/api/) is preserved as-is rather
# than cherry-picked, since pnpm's node_modules relies on relative symlinks between the workspace
# root and each package's own node_modules — copying only some of it risks silently broken links.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api ./apps/api

USER nestjs
ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/api/dist/src/main"]
