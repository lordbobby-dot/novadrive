# NovaDrive — Development Roadmap

A modern, enterprise-grade cloud storage platform. This document is the single source of truth
for how the project is sequenced. It is **not** implementation — no milestone's code is written
until the previous milestone is reviewed and confirmed production-ready by you.

## Confirmed foundational decisions

| Decision | Choice |
|---|---|
| Monorepo tooling | Turborepo + pnpm workspaces |
| Object storage (all environments, including local dev) | Real AWS S3 |
| Multi-tenancy | Deferred — personal workspace (single-owner Drive) ships first; Organizations/Workspaces/org-RBAC arrive in Milestone 10 |
| Workflow | Roadmap approved → build milestone → you verify it's production-ready → proceed to next milestone |

## Architectural principles (apply to every milestone)

- **Clean Architecture / DDD** in the NestJS API: `domain` (entities, value objects, domain
  services) → `application` (use cases / command-query handlers) → `infrastructure` (Prisma
  repositories, S3 adapters, BullMQ producers) → `interface` (REST controllers, DTOs, guards).
- **Repository Pattern**: controllers never touch Prisma directly; every aggregate (File, Folder,
  User, SharedLink, …) has a repository interface in `domain` and a Prisma implementation in
  `infrastructure`, swappable and unit-testable behind an interface.
- **Dependency Injection** via Nest's container everywhere; no service locators, no singletons
  reached through static imports.
- **CQRS-lite**: reads (list/search/paginate) and writes (create/update/delete) are separate
  handlers even before we need full event sourcing — keeps read models free to diverge (e.g.
  denormalized search rows) without polluting write-side invariants.
- **Metadata in Postgres, bytes in S3 — always.** No binary ever touches the database.
- **Every milestone ships with**: migrations, seed data, Swagger docs updated, unit + integration
  tests, and a short `MILESTONE_N.md` completion note (architecture actually implemented, any
  deviations from plan, how to verify manually).

## Monorepo layout

```
novadrive/
├── apps/
│   ├── web/                # Next.js 15 + React 19
│   └── api/                # NestJS
├── packages/
│   ├── ui/                 # Shared shadcn/tailwind component library
│   ├── types/               # Shared TS types / zod schemas (DTOs, enums)
│   ├── sdk/                 # Typed API client generated from OpenAPI, used by web
│   ├── config/              # Shared eslint/tsconfig/tailwind base configs
│   └── eslint-config, tsconfig/  # (may fold into config/)
├── shared/                  # Cross-cutting constants, error codes, permission matrices
├── docker-compose.yml        # Postgres, Redis (S3 is real AWS, no local emulation)
├── turbo.json
└── ROADMAP.md
```

---

## Milestone overview

| # | Milestone | Core deliverable |
|---|---|---|
| 0 | Foundation & Tooling | Monorepo boots, CI green, DB/Redis up, empty apps talk to each other |
| 1 | Auth & Identity | Register/login/logout, JWT+refresh rotation, email verify, password reset, OAuth Google/GitHub |
| 2 | Core Drive Data Model | Folders/Files/StorageObjects schema + CRUD APIs + Drive shell UI |
| 3 | Upload Pipeline | Multipart/chunked/resumable S3 uploads, progress, drag & drop |
| 4 | Download & Preview | Streaming downloads, signed URLs, preview for images/video/pdf/text/code |
| 5 | Folder Ops & Search | Move/copy/rename, recursive delete, breadcrumbs, Postgres full-text search |
| 6 | Trash, Versions & Activity | Soft delete/restore, FileVersions + rollback, activity log |
| 7 | Sharing & Permissions | SharedLinks, RBAC, ACL, email invitations |
| 8 | Realtime & Notifications | Socket.io, live upload/share/comment notifications |
| 9 | Security Hardening | 2FA/TOTP, WebAuthn, device mgmt, audit logs, rate limiting, virus scanning |
| 10 | Organizations & Multi-tenancy | Organizations/Workspaces, org RBAC, invitations at org level |
| 11 | Storage Quota | Per-user/org storage limits, usage tracking, quota alerts |
| 12 | Advanced Search & Command Palette | Filters, command palette, keyboard shortcuts |
| 13 | Admin Panel | User/org management, system health, analytics dashboard |
| 14 | Observability | Structured logging, health checks, metrics, tracing, error monitoring |
| 15 | Testing & CI/CD Hardening | Full unit/integration/e2e coverage, GitHub Actions pipelines |
| 16 | Deployment Readiness | Production Docker builds, docker-compose, runbooks |

Each milestone below expands: Architecture · Database · Backend · Frontend · Testing ·
Documentation · Tasks · Acceptance Criteria.

---

### Milestone 0 — Foundation & Tooling

**Architecture**
Turborepo + pnpm workspace wiring; `apps/api` NestJS skeleton with the clean-architecture folder
convention (`domain/application/infrastructure/interface`) pre-created but empty; `apps/web`
Next.js 15 (App Router) skeleton with Tailwind + shadcn initialized; shared `packages/config`
holding base `tsconfig`, `eslint`, `tailwind.config`; health-check endpoint wired end to end
(`web` calls `api` `/health`).

**Database**
Prisma initialized against Postgres; no domain tables yet beyond a placeholder `HealthCheck`
model used to prove migrations run. Docker Compose brings up Postgres 16 + Redis 7 (S3 is real
AWS — document required bucket + IAM policy in `docs/aws-setup.md`).

**Backend**
NestJS bootstrap, global `ValidationPipe`, Helmet, CORS config from env, config module
(`@nestjs/config`) with a validated env schema (zod), Swagger wired at `/api/docs`.

**Frontend**
Next.js app shell, Tailwind + shadcn base theme (light/dark via `next-themes`), root layout,
a placeholder landing page, React Query provider, Zustand store scaffold.

**Testing**
Jest configured in `apps/api` (unit) and Playwright scaffolded in `apps/web` (e2e smoke only —
"homepage renders"). No business logic yet to unit test beyond config validation.

**Documentation**
`README.md` (root) with setup instructions; `docs/aws-setup.md` for the S3 bucket/IAM the whole
project depends on from here forward.

**Tasks**
1. `pnpm dlx create-turbo` scaffold, restructure into `apps/`, `packages/`, `shared/`.
2. NestJS app in `apps/api` with clean-architecture directories + health module.
3. Next.js 15 app in `apps/web` with Tailwind, shadcn, dark mode toggle.
4. `docker-compose.yml` for Postgres + Redis.
5. Prisma init, first migration (`HealthCheck` placeholder), seed script stub.
6. Shared env-schema package, `.env.example` for both apps.
7. GitHub Actions: install, lint, typecheck, build (no deploy yet).
8. AWS S3 bucket + least-privilege IAM user for uploads; document ARNs/policy in
   `docs/aws-setup.md`.

**Acceptance criteria**
- `pnpm dev` boots both apps; web calls api `/health` and renders "API: healthy".
- `docker compose up` brings up Postgres + Redis cleanly; `pnpm --filter api prisma migrate dev`
  succeeds against it.
- CI pipeline is green on a trivial PR.
- Dark/light mode toggle works and persists across reload.

---

### Milestone 1 — Auth & Identity

> **Decision (superseding the original plan below the line):** Auth is delegated to **Clerk**
> rather than hand-built with custom JWT/session/OAuth code. Clerk is the identity provider for
> both apps; NovaDrive's own database keeps a thin, webhook-synced `User` row purely so the rest
> of the schema (Files, Folders, Permissions, ...) has something to put a foreign key on. This
> removes essentially all of the custom password/session/OAuth work below and pulls a chunk of
> Milestone 9 (2FA, WebAuthn/passkeys, device/session management, suspicious-login detection)
> forward for free, since Clerk provides all of that out of the box. See the note at the top of
> Milestone 9 for what's left there.

**Architecture**
Clerk is the identity provider; NovaDrive's API never sees passwords, OAuth tokens, or session
secrets. `apps/web` uses `@clerk/nextjs` (`clerkMiddleware()`, `<ClerkProvider>`, prebuilt
`<SignIn/>`/`<SignUp/>`/`<UserButton/>` components) for all registration/login/logout/account UI
— no custom auth forms. `apps/api` verifies the Clerk session JWT on every protected request via
a `ClerkAuthGuard` (`modules/auth/interface`, using `@clerk/backend`'s `verifyToken` against
Clerk's JWKS — no shared secret, no token minting on our side). A `POST /webhooks/clerk`
endpoint (Svix-signature-verified) keeps the local `User` table in sync with Clerk's
`user.created` / `user.updated` / `user.deleted` events. Google/GitHub OAuth are configured as
Social Connections in the Clerk Dashboard — zero Passport strategy code in our repo.

**Database**
A single `User` model: `id`, `clerkId` (unique, from Clerk), `email`, `name`, `avatarUrl`,
`createdAt`, `updatedAt`. No `Session`, `Device`, `RefreshToken`, or verification/reset token
tables — Clerk owns all of that state.

**Backend**
- `ClerkAuthGuard`: verifies `Authorization: Bearer <token>` via `@clerk/backend`, resolves (or
  lazily creates, as a defensive fallback if the webhook hasn't landed yet) the local `User` by
  `clerkId`, attaches it to the request. Reusable via `@UseGuards(ClerkAuthGuard)` on every
  future protected module.
- `POST /webhooks/clerk`: verifies the Svix signature (raw body, via Nest's `rawBody: true` app
  option) and upserts/deletes the local `User` row on `user.created`/`user.updated`/
  `user.deleted`.
- `GET /users/me`: first protected endpoint, proves the guard works end-to-end — returns the
  local user record.
- `modules/users/{domain,application,infrastructure,interface}` clean-architecture layering:
  `UserRepository` interface + Prisma implementation, `GetCurrentUserUseCase`,
  `SyncClerkUserUseCase`.

**Frontend**
`middleware.ts` protecting authenticated routes, `ClerkProvider` in the root layout, `/sign-in`
and `/sign-up` pages using Clerk's prebuilt components, `<UserButton/>` in the header, and a
protected `/dashboard` page that calls the API's `GET /users/me` with the Clerk session token —
proving frontend↔backend auth works together end-to-end.

**Testing**
Unit tests for `ClerkAuthGuard` (valid/invalid/missing token, mocking `@clerk/backend`), webhook
signature verification + upsert/delete logic. Integration test for `GET /users/me`. Full
sign-up→sign-in→protected-page flow is verified manually against a real Clerk application (Clerk
sign-in UI itself isn't something we own the code for, so it isn't a meaningful e2e-automation
target the way a custom form would be).

**Documentation**
`docs/clerk-setup.md`: creating a Clerk application, enabling Google/GitHub Social Connections,
required redirect URLs, where to get the publishable/secret keys, and how to configure the
webhook endpoint + signing secret.

**Tasks**
1. Prisma schema: `User` model (`clerkId`, `email`, `name`, `avatarUrl`) + migration.
2. `apps/api`: install `@clerk/backend` + `svix`; `ClerkAuthGuard`; `POST /webhooks/clerk`;
   `modules/users` (repository, use cases, `GET /users/me`); enable `rawBody` in `main.ts`.
3. `apps/web`: install `@clerk/nextjs`; `middleware.ts`; `ClerkProvider`; `/sign-in`, `/sign-up`;
   header with `<UserButton/>`; protected `/dashboard` calling `GET /users/me`.
4. Tests per above.
5. `docs/clerk-setup.md`; update both apps' `.env.example`.

**Acceptance criteria**
- Signing up (including via Google/GitHub) and signing in both work through Clerk's UI.
- An unauthenticated request to `/dashboard` redirects to `/sign-in`; an unauthenticated request
  to `GET /users/me` returns 401.
- Signing up triggers the Clerk webhook, which creates a matching local `User` row; the
  `/dashboard` page then successfully renders data fetched from `GET /users/me`.
- `ClerkAuthGuard` rejects missing, malformed, and invalid-signature tokens; accepts valid ones.

---

<details>
<summary>Original (superseded) custom-auth plan — kept for reference only, not being built</summary>

**Architecture**
`AuthModule` in clean-architecture layers: domain (`User`, `Session`, `RefreshToken` entities +
password hashing policy as a domain service), application (`RegisterUserUseCase`,
`LoginUseCase`, `RefreshTokenUseCase`, `RequestPasswordResetUseCase`, OAuth callback use cases),
infrastructure (Prisma repos, Argon2 hasher, mail sender adapter), interface (REST controllers +
guards). Access tokens are short-lived JWT (15 min); refresh tokens are opaque, hashed at rest,
rotated on every use, stored per-`Session`/`Device`.

**Database**
`User`, `Session`, `Device`, `RefreshToken` (or refresh token embedded in `Session`), plus
`EmailVerificationToken` and `PasswordResetToken`. Indexes on `User.email` (unique),
`Session.userId`, `RefreshToken.tokenHash`.

**Backend**
- Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`, `GET /auth/verify-email`, `POST /auth/forgot-password`,
  `POST /auth/reset-password`, `GET /auth/oauth/google`, `GET /auth/oauth/github` (+ callbacks).
- Argon2id password hashing, JWT via `@nestjs/jwt`, Passport strategies for Google/GitHub OAuth.
- Refresh-token rotation with reuse detection (a reused/stale token revokes the whole session
  family — basic breach detection).
- Rate limiting on `/auth/*` via `@nestjs/throttler` + Redis store.
- Transactional email adapter (SES or Resend — pick one) for verification/reset emails.

**Frontend**
Login, register, forgot/reset-password pages using React Hook Form + zod; OAuth buttons for
Google/GitHub; auth state in Zustand, silent refresh via React Query; protected-route middleware
in Next.js; account email-verification banner.

**Testing**
Unit tests for password hashing, token rotation/reuse-detection logic, use-case handlers with
mocked repos. Integration tests hitting a real test Postgres for register→verify→login→refresh→
logout flow. E2E (Playwright): full register-to-dashboard happy path.

**Documentation**
Swagger annotations on every auth endpoint; `docs/auth.md` explaining token lifetimes, rotation,
and OAuth setup (client IDs/secrets needed in env).

**Tasks**
1. Prisma schema: `User`, `Session`, `Device`, verification/reset token tables + migration.
2. Domain entities + password policy service.
3. Register/login/refresh/logout use cases + controllers + guards (`JwtAuthGuard`).
4. Email verification + password reset flows (token generation, expiry, single-use).
5. Google + GitHub OAuth strategies and callback handling, account linking by email.
6. Rate limiting + Redis-backed throttler on auth routes.
7. Frontend auth pages, forms, Zustand auth store, protected-route wrapper.
8. Tests (unit, integration, e2e) per above.

**Acceptance criteria**
- Can register, receive a (logged/dev-mode) verification email, verify, and log in.
- Access token expires in 15 min and silently refreshes without logging the user out.
- Logging in on a second device does not invalidate the first; logging out only kills that
  session.
- Reusing an already-rotated refresh token revokes the entire session family.
- Google and GitHub OAuth complete an end-to-end login against real (dev) OAuth apps.
- All auth endpoints documented in Swagger; rate limiting demonstrably blocks brute force.

</details>

---

### Milestone 2 — Core Drive Data Model

**Architecture**
`DriveModule` split into `FoldersModule` and `FilesModule`, each with domain entities
(`Folder`, `File`, `StorageObject`), repository interfaces, and use cases for basic CRUD. No
upload pipeline yet — this milestone proves the metadata model and UI shell; file "creation" in
tests uses stubbed `StorageObject` rows.

**Database**
`Folder` (self-referential `parentId`, materialized path or closure table for fast subtree
queries — decide and document), `File` (belongs to `Folder`, points to `StorageObject`),
`StorageObject` (bucket, key, eTag, checksum, contentType, size, storageClass, encryptionStatus,
version, region, ownerId, timestamps), `Trash` (soft-delete marker), `Favorite`. Root folder
per user created on registration (hook into Milestone 1's register use case).

**Backend**
CRUD endpoints for folders (`create`, `rename`, `list children`, `get breadcrumb path`) and
files (`create metadata record`, `rename`, `get`, `list by folder`), cursor-based pagination,
ownership checks (every resource scoped to `ownerId` for now — org-scoping comes in M10).

**Frontend**
Drive shell: resizable sidebar (My Drive / Shared / Recent / Favorites / Trash placeholders),
breadcrumb bar, grid/list view toggle, "New folder" dialog, context menu (rename/delete stubs),
loading skeletons, React Query for folder/file listing with optimistic rename.

**Testing**
Unit tests for folder path/depth logic (unlimited nesting) and ownership guards. Integration
tests for folder CRUD + pagination. E2E: create nested folders, rename, see breadcrumb update.

**Documentation**
`docs/data-model.md` explaining the Folder/File/StorageObject split and why binaries are never
in Postgres; ERD diagram.

**Tasks**
1. Prisma schema for `Folder`, `File`, `StorageObject`, `Trash`, `Favorite` + migration.
2. Root-folder-on-registration hook.
3. Folder repository + use cases (create, rename, list children, breadcrumb resolution).
4. File metadata repository + use cases (create record, rename, get, list).
5. REST controllers + DTOs + Swagger.
6. Next.js Drive shell UI (sidebar, breadcrumbs, grid/list, new-folder dialog).
7. React Query hooks + Zustand UI-state store (selected items, view mode).
8. Tests per above.

**Acceptance criteria**
- User can create arbitrarily deep nested folders and navigate via breadcrumbs.
- Folder/file listing is paginated (cursor-based) and performs well with 10k+ synthetic rows
  (seed script provided).
- Grid/list view toggle persists per user (localStorage or `UserSettings` stub).
- No binary data anywhere in Postgres; `StorageObject` rows are metadata-only placeholders at
  this stage.

---

### Milestone 3 — Upload Pipeline

**Architecture**
`UploadsModule` orchestrates S3 multipart uploads via presigned URLs (browser uploads directly
to S3 — API never proxies bytes). BullMQ + Redis queue handles post-upload processing
(checksum verification, `StorageObject` finalization, thumbnail/preview generation trigger for
M4). Upload state machine: `pending → uploading → completed | aborted | failed`.

**Database**
Extend `StorageObject` with `uploadId` (S3 multipart upload id), `uploadStatus`; add
`UploadPart` (partNumber, eTag, size) for resumability bookkeeping.

**Backend**
- `POST /uploads/initiate` (creates S3 multipart upload, returns uploadId + first batch of
  presigned part URLs).
- `POST /uploads/:id/presign-parts` (get more presigned URLs for parallel/chunked upload).
- `POST /uploads/:id/complete` (calls S3 CompleteMultipartUpload, enqueues checksum-verify job).
- `POST /uploads/:id/abort` (cancel — aborts S3 multipart upload, cleans up).
- BullMQ worker: verifies checksum against client-reported hash, updates `StorageObject` +
  `File` to `completed`, emits activity event (consumed in M6).
- File type/size/content validation before presigning (extension allow/deny list, max size).

**Frontend**
Drag-and-drop zone + toolbar "Upload" button, chunked parallel upload with per-file progress
bars, pause/resume/cancel/retry controls, background upload persistence (survives navigation
via a Zustand upload-queue store), toast on completion/failure.

**Testing**
Unit tests for the upload state machine and checksum verification logic. Integration tests
against a real S3 test bucket/prefix (multipart initiate→part upload→complete). E2E: drag a
file in, watch progress, see it appear in the Drive listing.

**Documentation**
`docs/uploads.md`: multipart flow diagram, resumability strategy, size/type validation rules.

**Tasks**
1. Prisma migration: `UploadPart`, `StorageObject` upload-state fields.
2. S3 adapter (initiate/presign-part/complete/abort) via AWS SDK v3.
3. Upload use cases + controllers + DTOs (size/type validation).
4. BullMQ queue + worker for checksum verification and finalization.
5. Frontend drag & drop, chunked upload manager, progress/pause/resume/cancel UI.
6. Background upload persistence across route navigation.
7. Tests per above.

**Acceptance criteria**
- A 2GB+ file uploads successfully via multipart with visible progress.
- Pausing and resuming an in-progress upload continues from the last completed part, not from
  zero.
- Network failure mid-upload triggers automatic retry with backoff; user can also cancel/abort
  cleanly (S3 multipart upload aborted, no orphaned parts).
- Checksum mismatch is detected and the upload is marked failed, not silently accepted.
- Multiple files upload in parallel with independent progress and controls.

---

### Milestone 4 — Download & Preview

**Architecture**
`DownloadsModule` issues short-lived signed S3 GET URLs; range-request support for streaming
(video/audio scrubbing, PDF partial loads) is handled by S3 natively via signed URLs with
`Range` headers passed through by the browser — API's job is just safe, scoped signing.

**Database**
No new tables; may add `lastAccessedAt` to `File` for "Recent" (used in M12) but optional here.

**Backend**
`GET /files/:id/download-url` (returns a signed URL, permission-checked, short TTL),
`GET /files/:id/preview-url` (same, potentially different disposition/response headers for
inline viewing vs. attachment). Bandwidth-throttling hook point documented (S3 doesn't support
server-side throttling directly — note the design tradeoff and defer real throttling to a
CloudFront/signed-cookie approach if ever needed).

**Frontend**
Preview modal/pane supporting: images (native `<img>`), video/audio (`<video>`/`<audio>` with
range-seek), PDF (pdf.js), Markdown (rendered), code/text (syntax-highlighted read-only editor),
CSV (table view), JSON (tree view). Download button uses the signed URL directly (no proxy).

**Testing**
Unit tests for permission checks on signed-URL issuance. Integration tests verifying a signed
URL actually round-trips to the right S3 object. E2E: preview each supported file type renders
without error; download triggers a real file save.

**Documentation**
`docs/downloads-and-preview.md`: signed URL TTLs, supported preview formats, range-request
notes.

**Tasks**
1. Signed URL use cases (download/preview) with ownership/permission checks.
2. Controllers + DTOs + Swagger.
3. Frontend preview components per file-type family (image/video/audio/pdf/markdown/code/
   csv/json), dispatched by `contentType`.
4. Download button wiring, "open in new tab" for previewable types.
5. Tests per above.

**Acceptance criteria**
- Every listed preview type renders correctly for a representative sample file.
- Video/audio support seeking (range requests work end-to-end through the signed URL).
- Signed URLs expire (verify a stale URL is rejected by S3) and cannot be issued for files the
  requester doesn't own/have access to.
- Downloading a large file streams rather than buffering fully in the browser tab.

---

### Milestone 5 — Folder Operations & Search

**Architecture**
Move/copy/recursive-delete implemented as domain services enforcing invariants (no moving a
folder into its own descendant, copy deep-clones metadata + creates new `StorageObject`
references or S3 object copies as appropriate). Search implemented as a dedicated read-model
query service using Postgres full-text search (`tsvector` column + GIN index), isolated behind
an interface so it can be swapped for OpenSearch later without touching callers (per your future
OpenSearch note).

**Database**
Add `searchVector` (`tsvector`, generated column) to `File`/`Folder` with a GIN index;
`Tag` and `FileTag`/`FolderTag` join tables for tag-based search.

**Backend**
`PATCH /folders/:id/move`, `POST /folders/:id/copy`, `DELETE /folders/:id` (recursive, soft),
equivalents for files; `GET /search?q=...&type=&owner=&dateFrom=&dateTo=` backed by the FTS
query service with cursor pagination.

**Frontend**
Cut/copy/paste and drag-to-move in the Drive grid, multi-select (shift/cmd-click), recursive
delete confirmation showing item count, global search bar with instant results dropdown +
full search results page with filters.

**Testing**
Unit tests for the "can't move folder into own descendant" and recursive-delete invariants.
Integration tests for search relevance/pagination. E2E: multi-select, move via drag, search for
a file by partial name and by tag.

**Documentation**
`docs/search.md` documenting the FTS query shape and the seam where OpenSearch would plug in
later.

**Tasks**
1. Migration: `searchVector` generated columns + GIN indexes, `Tag`/`FileTag`/`FolderTag`.
2. Move/copy/recursive-delete domain services + use cases + controllers.
3. Search query service (Postgres FTS) + controller + DTOs.
4. Frontend: multi-select, drag-to-move, cut/copy/paste, search bar + results page, tag chips.
5. Tests per above.

**Acceptance criteria**
- Moving a folder into its own subfolder is rejected with a clear error.
- Recursive delete on a folder with 1000+ descendant files completes without timing out
  (batched/transactional as needed) and soft-deletes the whole subtree.
- Search returns relevant results ranked sensibly, filterable by type/owner/date/tag, in
  under ~300ms on seeded data of 50k+ rows.

---

### Milestone 6 — Trash, Versioning & Activity

**Architecture**
`TrashModule` (restore / permanent-delete / scheduled auto-cleanup via a BullMQ repeatable job),
`VersionsModule` (every file content update creates an immutable `FileVersion` pointing at its
own `StorageObject`, current pointer moves on the `File`), `ActivityModule` (append-only event
log, written via a domain-event dispatcher so every use case across the app just emits events
rather than hand-writing activity rows).

**Database**
`FileVersion` (fileId, storageObjectId, versionNumber, createdBy, createdAt, changeNote),
`Activity` (actorId, action enum, targetType, targetId, metadata jsonb, createdAt, ipAddress).
Index `Activity` by `targetId` and by `actorId` + `createdAt` for feed queries.

**Backend**
`POST /files/:id/restore`, `DELETE /trash/:id/permanent`, scheduled job for auto-cleanup after
a configurable retention window; `GET /files/:id/versions`, `POST /files/:id/versions/:v/
restore`, `GET /files/:id/versions/:v/download-url`; `GET /activity` (feed, filterable by
target/type/date) and a lightweight domain-event bus (`EventEmitter2` is sufficient — no need
for a separate broker at this scale) that activity + notification (M8) subscribers hang off of.

**Frontend**
Trash page (restore/permanently-delete/empty-trash, days-remaining indicator), version history
panel (list versions, diff metadata, restore/download any version), activity feed component
(per-file "Activity" tab and a global activity page).

**Testing**
Unit tests for the domain-event dispatch and retention-window calculation. Integration tests for
restore/permanent-delete and version rollback. E2E: edit a file twice, see two versions, restore
the first, confirm current content matches.

**Documentation**
`docs/versioning-and-activity.md`.

**Tasks**
1. Migrations: `FileVersion`, `Activity`.
2. Domain event dispatcher wired into existing use cases (upload, rename, move, delete, share
   — retrofitted from prior milestones).
3. Trash restore/permanent-delete + BullMQ repeatable cleanup job.
4. Version creation on file update + rollback/compare/download-previous use cases.
5. Activity feed query service + controller.
6. Frontend: Trash page, version history panel, activity feed.
7. Tests per above.

**Acceptance criteria**
- Deleted items appear in Trash and are restorable to their original location (or a sane
  fallback if the original folder was also deleted).
- Items older than the retention window are auto-purged by the scheduled job (verify via a
  short retention window in test config).
- Uploading a new version of a file preserves the old one; restoring an old version makes it
  current without losing the version that was replaced.
- Every major action (upload/download/delete/rename/move/share/login/logout/permission-change/
  version-restore) shows up in the activity feed with correct actor and timestamp.

---

### Milestone 7 — Sharing & Permissions

**Architecture**
`SharingModule` with `Permission` (RBAC role per user-per-resource, with inheritance down the
folder tree resolved at query time) and `SharedLink` (public/token-based access, independent of
RBAC). Permission resolution is a single domain service (`PermissionResolver`) that every other
module's guards call — one source of truth for "can actor X do action Y on resource Z."

**Database**
`Permission` (subjectId, resourceType, resourceId, role enum: owner/admin/editor/viewer/guest,
grantedBy), `SharedLink` (resourceId, token, passwordHash?, expiresAt?, maxDownloads?,
downloadCount, permissions: view/comment/edit/download flags, visibility: private/org/public),
`Invitation` (email, resourceId, role, token, expiresAt, status), `Comment` (resourceId,
authorId, body, createdAt, resolved).

**Backend**
`POST /permissions` (grant), `DELETE /permissions/:id` (revoke), `GET /resources/:id/
permissions`; `POST /shared-links`, `GET /shared-links/:token` (public, password-gated),
`DELETE /shared-links/:id`; `POST /invitations`, `POST /invitations/:token/accept`; comment
CRUD. `PermissionGuard` retrofitted onto every existing file/folder endpoint from M2–M6.

**Frontend**
Share dialog (invite by email with role picker, generate public link with password/expiry/
max-downloads/permission toggles, list of current collaborators with role management), public
share-link landing page (password prompt if protected, view/download per link permissions),
comment panel on file preview.

**Testing**
Unit tests for `PermissionResolver` inheritance rules (folder permission cascades to children
unless overridden) and `SharedLink` expiry/max-download enforcement. Integration tests for the
full invite→accept→access flow. E2E: create a password-protected link, open it in an
unauthenticated session, verify password gate and download-limit enforcement.

**Documentation**
`docs/permissions.md` with the RBAC matrix (Owner/Admin/Editor/Viewer/Guest × actions) and the
inheritance algorithm.

**Tasks**
1. Migrations: `Permission`, `SharedLink`, `Invitation`, `Comment`.
2. `PermissionResolver` domain service + retrofit `PermissionGuard` onto prior modules'
   endpoints.
3. Sharing use cases (grant/revoke, link create/access/revoke, invite/accept) + controllers.
4. Comment CRUD use cases + controllers.
5. Frontend: share dialog, public link page, collaborator management, comment panel.
6. Tests per above.

**Acceptance criteria**
- Granting Viewer on a folder gives read-only access to everything inside it unless a child
  resource has an explicit override.
- A password-protected, expiring, download-limited public link enforces all three constraints
  correctly and stops working after expiry/limit is hit.
- Email invitation flow works end-to-end for both existing and new users (new user is prompted
  to register, then lands with the granted role already applied).
- Every sharing action retrofits correctly onto pre-existing resources from earlier milestones
  with no regression in owner-only access.

---

### Milestone 8 — Realtime & Notifications

**Architecture**
`RealtimeModule` wraps Socket.io behind a gateway that authenticates via the existing JWT,
joins per-user and per-resource rooms; `NotificationsModule` persists notifications and pushes
them over the socket when the recipient is connected (falls back to "unread" state otherwise).
Both subscribe to the domain-event bus introduced in M6 — no new coupling into business use
cases required.

**Database**
`Notification` (recipientId, type, payload jsonb, readAt, createdAt).

**Backend**
Socket.io gateway with JWT handshake auth, rooms per user + per watched resource; REST
`GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`;
event subscribers translating domain events (upload complete, share invitation, new comment,
permission change, storage-near-full) into notification rows + socket emits.

**Frontend**
Notification bell with unread count, dropdown list, real-time toast on new events, live upload-
progress sync across tabs, live "someone is viewing this file" presence indicator (nice-to-have,
document as stretch if time-constrained).

**Testing**
Unit tests for event→notification translation. Integration test for socket auth handshake.
E2E: trigger a share invitation in one browser context, see the toast/notification appear in
another authenticated context in near real time.

**Documentation**
`docs/realtime.md`.

**Tasks**
1. Migration: `Notification`.
2. Socket.io gateway + JWT handshake auth + room management.
3. Notification persistence + REST endpoints.
4. Domain-event subscribers wiring uploads/shares/comments/permission-changes/quota-alerts to
   notifications.
5. Frontend: notification bell/dropdown, toasts, cross-tab upload sync.
6. Tests per above.

**Acceptance criteria**
- A logged-in user receives a real-time toast for a share invitation without refreshing.
- Notifications persist and show correct read/unread state across sessions/devices.
- Socket connections reject invalid/expired JWTs at handshake.
- Upload progress started in one tab is reflected live in another tab for the same user.

---

### Milestone 9 — Security Hardening

> **Note (post-Clerk):** Since M1 delegates identity to Clerk, 2FA (TOTP + backup codes),
> passkeys/WebAuthn, session/device management, and suspicious new-device/location sign-in
> alerts are already provided by Clerk and configured/enabled in the Clerk Dashboard rather than
> built here — no `TotpSecret`/`WebAuthnCredential` tables or `@simplewebauthn/server` code.
> What's left for this milestone is everything Clerk doesn't cover: the platform-side
> `AuditLog`, rate limiting, CSRF/CSP hardening, and the virus-scanning pipeline. The frontend
> task shrinks to linking out to Clerk's own account-security UI (`<UserProfile/>`) instead of
> building a custom security settings page.

**Architecture**
Cross-cutting security concerns layered onto the existing app: global rate limiting tuned
per-route, CSRF protection for cookie-based flows, structured audit logging distinct from the
user-facing activity feed, and a virus-scanning step inserted into the M3 upload-finalization
BullMQ pipeline.

**Database**
`AuditLog` (distinct from `Activity` — security-focused: login attempts, permission escalations,
admin actions, IP/user-agent, success/failure). No `TotpSecret`/`WebAuthnCredential`/`Device`
trust-field tables — Clerk owns that state.

**Backend**
- Audit-log subscriber on the domain-event bus (from M6) capturing security-relevant events,
  fed by Clerk webhooks for auth-side events (sign-in, sign-out, new-device) in addition to
  in-app events.
- Virus-scanning worker (ClamAV via a sidecar/container, or a cloud AV API — pick one and
  document) runs before a `StorageObject` is marked available for download; infected files are
  quarantined, not silently deleted.
- Global `ThrottlerGuard` tuning per route class, CSRF double-submit-cookie for any
  cookie-authenticated surface, strict `Helmet`/CSP config, parameterized-query audit (Prisma
  already protects against SQLi — verify no raw string interpolation anywhere in the codebase).

**Frontend**
Security settings surfaced via Clerk's own `<UserProfile/>` component (2FA, passkeys, active
sessions/devices all live there already) rather than a custom-built page; NovaDrive only adds a
link into it plus a view of the NovaDrive-specific `AuditLog`.

**Testing**
Unit tests for the audit-log event subscriber. Integration tests for the virus-scan quarantine
path (upload an EICAR test file, confirm quarantine + no download URL issued). Security-focused
tests: attempt SQLi/XSS payloads against every input, confirm sanitization/parameterization
holds. 2FA/WebAuthn themselves are Clerk's tested surface, not ours to re-test.

**Documentation**
`docs/security.md` covering how Clerk's 2FA/passkey/session-management features are enabled and
where users manage them, `AuditLog` retention, the virus-scan pipeline, and a security checklist
mapped to OWASP Top 10.

**Tasks**
1. Migration: `AuditLog`.
2. Audit-log event subscriber (in-app events + Clerk webhook auth events).
3. Virus-scanning worker inserted into upload pipeline; quarantine flow.
4. Global rate-limit tuning, CSRF, CSP/Helmet hardening pass across both apps.
5. Frontend: link into Clerk's `<UserProfile/>`, NovaDrive `AuditLog` view.
6. Security-focused test suite (injection payloads, auth bypass attempts) + standard tests.

**Acceptance criteria**
- 2FA/passkey enrollment and login both work via Clerk's `<UserProfile/>` and sign-in flow
  (verified against Clerk, not custom code).
- An EICAR test file upload is caught, quarantined, and never becomes downloadable.
- A Clerk sign-in webhook event and a sensitive in-app action both produce an `AuditLog` entry.
- Automated SQLi/XSS payload sweep across all input fields shows no vulnerabilities.

---

### Milestone 10 — Organizations & Multi-tenancy

**Architecture**
Introduces `Organization` and `Workspace` as new top-level scopes above the personal Drive.
Existing `Folder`/`File`/`Permission` gain an optional `organizationId`/`workspaceId`; the
`PermissionResolver` from M7 is extended (not replaced) to also check org-level roles. Personal
Drive continues to work unchanged — orgs are additive.

**Database**
`Organization`, `Workspace` (belongs to org), `OrganizationMember` (userId, orgId, role),
migration adding nullable `organizationId`/`workspaceId` to `Folder`/`File`, `Invitation`
extended to support org-level invites.

**Backend**
Org CRUD, workspace CRUD, member management (invite/remove/change role), org-scoped Drive
endpoints (list folders/files within a workspace), `PermissionResolver` extension for org roles
inheriting into workspace/folder/file permissions.

**Frontend**
Org switcher in the sidebar, workspace creation flow, member management page (invite/roles/
remove), org-scoped Drive views alongside personal "My Drive."

**Testing**
Unit tests for combined personal + org permission resolution. Integration tests for org/
workspace CRUD and member role changes. E2E: create an org, invite a member, member sees the
shared workspace with correct role-based access.

**Documentation**
`docs/organizations.md`.

**Tasks**
1. Migrations: `Organization`, `Workspace`, `OrganizationMember`, nullable org/workspace FKs on
   existing tables.
2. Org/workspace CRUD use cases + controllers.
3. Member management (invite/remove/role-change) reusing M7's invitation machinery.
4. `PermissionResolver` extension for org-level roles.
5. Frontend: org switcher, workspace UI, member management page.
6. Tests per above.

**Acceptance criteria**
- Personal Drive (no org) continues to function exactly as before — zero regression.
- Creating an org, inviting a member with Editor role, and having that member upload/edit within
  a shared workspace all work correctly.
- A Viewer-role org member cannot delete or share org files.

---

### Milestone 11 — Storage Quota

**Architecture**
`QuotaModule` tracks usage incrementally (updated on upload-complete/delete events from the
event bus, not computed by scanning S3) per user and per organization. No billing/payment
concepts — a quota is just a `limitBytes` value settable per subject (initially via a config
default and/or direct admin/DB action; a self-serve upgrade flow is out of scope until a
billing milestone is actually planned).

**Database**
`StorageQuota` (subjectType: user/org, subjectId, limitBytes, usedBytes, updatedAt).

**Backend**
Quota-check guard on upload-initiate (M3) rejecting uploads that would exceed the limit;
event-subscriber that increments/decrements `usedBytes` on upload-complete/delete/permanent-
delete; `GET /quota` (usage + limit + breakdown by type), quota-warning notification (subscribes
into M8) at 80%/95%/100%.

**Frontend**
Storage usage page (donut chart by file type, usage bar showing used/limit), quota-full/
near-full banners blocking new uploads once the limit is hit.

**Testing**
Unit tests for increment/decrement correctness under concurrent uploads/deletes. Integration
test: upload until quota exceeded, confirm rejection; delete to free space, confirm re-enabled.

**Documentation**
`docs/quota.md`.

**Tasks**
1. Migration: `StorageQuota`.
2. Quota-check guard wired into upload-initiate.
3. Event subscribers maintaining `usedBytes` accurately (including version history and trash
   retention counting toward usage, per your call on whether trashed items count).
4. Quota REST endpoint + warning notifications at thresholds.
5. Frontend: usage page, banners.
6. Tests per above.

**Acceptance criteria**
- Uploading beyond the configured quota is rejected with a clear, actionable error before any
  S3 multipart upload is even initiated.
- `usedBytes` stays accurate under concurrent upload/delete load (verified via a load test with
  parallel operations).
- Quota-warning notifications fire at the documented thresholds exactly once per threshold
  crossing (no spam).

---

### Milestone 12 — Advanced Search & Command Palette

**Architecture**
Builds on M5's search service — adds a `cmdk`-based command palette in the frontend as a UI
layer only (no new backend concepts), plus richer backend filter combinations and a "Recent"
read model (`lastAccessedAt` tracking from M4, formalized here).

**Database**
No new tables beyond formalizing `File.lastAccessedAt` (added in M4) and possibly a
materialized "recent items" view per user if performance requires it.

**Backend**
`GET /search` extended with combinable filters (type + tag + owner + date range + folder scope
simultaneously), `GET /recent`, `GET /favorites` (already exists from M2, exposed via search-
style filtering here too).

**Frontend**
Command palette (⌘K) for fuzzy file/folder jump, run-action-from-anywhere (new folder, upload,
go to trash, toggle theme), full keyboard shortcut set (documented shortcut sheet, ⌘K to open
it), advanced search filter UI (chips for active filters).

**Testing**
Unit tests for combined filter query building. E2E: open command palette, jump to a file by
partial name, trigger an action via keyboard only.

**Documentation**
`docs/keyboard-shortcuts.md` (also surfaced in-app).

**Tasks**
1. Extend search query service for combinable filters.
2. `Recent`/formal `lastAccessedAt` tracking wired into file-open/download use cases.
3. Command palette component (`cmdk` or shadcn's) wired to navigation + actions.
4. Global keyboard shortcut handler + shortcut-sheet UI.
5. Advanced filter chip UI on the search results page.
6. Tests per above.

**Acceptance criteria**
- ⌘K opens the palette from anywhere in the app and can both navigate to a file and trigger an
  action (e.g., "New folder") without touching the mouse.
- Combined filters (e.g., type=PDF AND tag=invoices AND date range) return correct
  intersected results.
- Full keyboard-only navigation is possible for the core Drive workflows (browse, open, upload
  trigger, search).

---

### Milestone 13 — Admin Panel

**Architecture**
`AdminModule`, gated by a platform-level `Admin` role (distinct from per-resource RBAC — this is
a system role on `User`), read-mostly dashboards backed by aggregate queries over existing
tables (no new domain concepts, mostly reporting use cases).

**Database**
Add `isSystemAdmin` (or a `SystemRole` enum) to `User`. No other new tables — admin views query
existing `Organization`, `AuditLog`, `Activity`.

**Backend**
`GET /admin/users` (search/paginate/suspend), `GET /admin/organizations`,
`GET /admin/audit-logs` (paginated/filterable), `GET /admin/system-health`
(DB/Redis/S3/queue connectivity + basic metrics), `GET /admin/analytics` (signups over time,
storage growth, active users — aggregate SQL queries).

**Frontend**
Admin layout (separate route group, admin-only middleware), user management table
(search/suspend/role-change), org management table, audit log viewer with
filters, system health dashboard, analytics charts.

**Testing**
Unit tests for admin authorization (non-admin gets 403 everywhere). Integration tests for each
admin query endpoint against seeded data. E2E: non-admin redirected away from `/admin`, admin
can suspend a user and that user's session is invalidated.

**Documentation**
`docs/admin.md`.

**Tasks**
1. Migration: `isSystemAdmin`/`SystemRole` on `User`.
2. Admin authorization guard.
3. User/org/audit-log/analytics query services + controllers.
4. System health aggregation endpoint (checks DB, Redis, S3 reachability, queue depth).
5. Frontend admin section: layout, tables, filters, charts, health dashboard.
6. Tests per above.

**Acceptance criteria**
- Only system admins can reach any `/admin/*` route or API endpoint; everyone else gets a clean
  403/redirect.
- Suspending a user immediately invalidates their active sessions (ties back into M1's session
  model).
- System health dashboard accurately reflects a deliberately broken dependency (e.g., stop Redis
  locally, confirm the dashboard shows it down).

---

### Milestone 14 — Observability

**Architecture**
Cross-cutting: structured JSON logging (pino) with correlation IDs propagated from HTTP request
through BullMQ jobs; `/health` (liveness) and `/health/ready` (readiness — checks DB/Redis/S3)
endpoints properly implemented (M0's placeholder becomes real); Prometheus-compatible metrics
endpoint; OpenTelemetry tracing across API → Prisma → S3 calls → BullMQ; error monitoring via
Sentry (or equivalent) on both apps.

**Database**
None.

**Backend**
`nestjs-pino` integration with request-id middleware, `/metrics` endpoint (`prom-client`),
OpenTelemetry SDK instrumentation, Sentry NestJS integration (error filter), readiness probe
checking all critical dependencies.

**Frontend**
Sentry browser integration (source-mapped), Web Vitals reporting.

**Testing**
Unit tests confirming correlation IDs propagate through a request→job chain. Integration test
hitting `/health/ready` with a dependency down, confirming it reports unhealthy correctly.

**Documentation**
`docs/observability.md`: log format, trace propagation, how to read metrics/dashboards.

**Tasks**
1. `nestjs-pino` + correlation-id middleware, propagated into BullMQ job payloads.
2. `/health` and `/health/ready` real implementations.
3. `/metrics` endpoint with request-duration, queue-depth, upload-throughput metrics.
4. OpenTelemetry instrumentation across HTTP/Prisma/S3/BullMQ.
5. Sentry integration on both `apps/api` and `apps/web`.
6. Tests per above.

**Acceptance criteria**
- Every log line includes a correlation ID traceable from the originating HTTP request through
  any background job it spawned.
- `/health/ready` correctly reports unhealthy when Postgres, Redis, or S3 is unreachable, and
  healthy otherwise.
- A deliberately thrown error in either app appears in Sentry with a readable stack trace.
- `/metrics` is scrapeable and shows meaningful request/queue data under load.

---

### Milestone 15 — Testing & CI/CD Hardening

**Architecture**
No new product code — this milestone raises coverage and pipeline rigor across everything built
so far to a level a real production SaaS would require before General Availability.

**Backend/Frontend**
Fill coverage gaps identified across M0–M14 (target: meaningful coverage on domain/application
layers, not just line-count vanity metrics); contract tests between `apps/web`'s SDK and
`apps/api`'s OpenAPI spec (fail CI on drift); load test for upload pipeline and search under
realistic concurrency.

**Testing**
Full Playwright E2E suite covering every milestone's acceptance criteria as automated
regression; visual regression baseline (optional, document as stretch); mutation-testing spot
check on the permission-resolution logic (highest-risk correctness surface in the app).

**CI/CD**
GitHub Actions: matrix lint/typecheck/unit/integration/e2e jobs, Docker image build + push on
merge to main, Prisma migration-drift check, dependency-audit (`pnpm audit`) gate, required
status checks before merge.

**Documentation**
`docs/testing-strategy.md`, `docs/ci-cd.md`.

**Tasks**
1. Coverage audit against M0–M14; backfill gaps.
2. SDK/OpenAPI contract test in CI.
3. Load test scripts (k6 or Artillery) for upload + search.
4. Full GitHub Actions pipeline: lint, typecheck, unit, integration, e2e, build, audit,
   migration-drift check.
5. Branch protection recommendation doc (required checks before merge — actual GitHub settings
   change requires your action, not mine).

**Acceptance criteria**
- CI fails on any lint/type/test regression, migration drift, or OpenAPI/SDK contract mismatch.
- Load test demonstrates the upload pipeline and search hold up under a defined concurrency
  target (e.g., 100 concurrent uploads, 500 req/s search) without error-rate spikes.
- Every acceptance criterion from Milestones 0–14 has a corresponding automated test.

---

### Milestone 16 — Deployment Readiness

**Architecture**
Production Dockerfiles (multi-stage, minimal final images) for `apps/api` and `apps/web`;
Postgres/Redis as managed-service recommendations (not self-hosted in-cluster for production)
with connection-string-driven config. Kubernetes/Helm packaging is explicitly deferred — not
needed right now — so this milestone targets a single-host/Compose-style production deployment
instead of orchestrated container scheduling.

**Backend/Frontend**
No product code changes — packaging and config only. Externalize all remaining hardcoded config
to env/secrets (audit pass).

**Testing**
Smoke test suite runnable against a freshly deployed environment (`docs/smoke-test.md` +
script).

**Documentation**
`docs/deployment.md` (Docker Compose for staging-like local prod, required secrets/env vars,
scaling notes for BullMQ workers vs. API processes), runbook for common incidents (queue
backlog, S3 throttling, DB connection exhaustion).

**Tasks**
1. Production multi-stage Dockerfiles for `apps/api` and `apps/web`.
2. `docker-compose.prod.yml` reference (still: Postgres + Redis; S3 remains real AWS).
3. Full env/secret audit — nothing sensitive hardcoded or committed.
4. `docs/deployment.md` + incident runbook.
5. Smoke-test script for post-deploy verification.

**Acceptance criteria**
- `docker build` produces working production images for both apps under a defined size budget.
- `docker-compose.prod.yml` brings up a working stack (API, web, BullMQ worker, Postgres, Redis)
  on a single host, reachable end-to-end.
- Smoke-test script passes against the freshly deployed environment.

*Kubernetes/Helm manifests, HPA, and multi-node orchestration are out of scope for now — revisit
as a future milestone if/when the deployment target actually requires a cluster.*

---

## How we proceed

1. You review this roadmap and request any changes to scope, ordering, or milestone boundaries.
2. Once approved, I build **Milestone 0** only, then stop and report what was built, how to run
   it, and what to verify.
3. You confirm Milestone 0 is production-ready (or request fixes).
4. Repeat for each subsequent milestone — I never jump ahead without your confirmation.
