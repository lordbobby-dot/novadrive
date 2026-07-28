# Realtime & Notifications

## Architecture

`RealtimeModule` wraps Socket.io behind `RealtimeGateway` (`@WebSocketGateway`), authenticated at
handshake by reusing `AuthenticateWithClerkTokenUseCase` — the same token-verification and
local-user-resolution logic `ClerkAuthGuard` uses for HTTP requests, extracted into its own
use case so neither entry point duplicates it. A socket with no token, an invalid token, or an
expired token is disconnected immediately in `handleConnection`; a socket that authenticates
successfully joins a `user:{userId}` room and nothing else — every tab a user has open ends up
in the same room, which is exactly the mechanism cross-tab sync relies on.

`RealtimeEmitter` is the only way anything else in the app pushes a socket event. It doesn't hold
a `@WebSocketServer()` itself — that decorator only binds on classes Nest recognizes as gateways —
so `RealtimeGateway.afterInit(server)` hands the `Server` instance to `RealtimeEmitter.setServer()`
once Socket.io finishes booting. Callers just do
`realtimeEmitter.emitToUser(userId, event, payload)`; they don't know or care whether the
recipient is currently connected. If not, the event silently drops — undelivered pushes rely on
the recipient re-fetching state on their next visit (`GET /notifications`, `GET
/notifications/unread-count`), not on redelivery.

Two independent things ride on top of this shared gateway, and they're deliberately not the same
mechanism:

### Persisted notifications (`NotificationsModule`)

`Notification` (recipientId, type, payload jsonb, readAt, createdAt) is written by
`NotificationEventListener`, the only place in the app that knows the table exists — it subscribes
to the same `ACTIVITY_EVENT` bus every use case already emits through (introduced in M6), exactly
mirroring how `ActivityListener` turns those events into `Activity` rows. Not every
`ActivityEvent` names a recipient worth notifying, so the listener only reacts to three actions,
each with its own recipient-resolution rule:

- **`PERMISSION_CHANGE`** — the recipient is `metadata.subjectId` (the person whose access
  changed), skipped if it's missing or equals the actor. It's missing exactly once: when a user
  accepts their own invitation, the resulting `PERMISSION_CHANGE` event has no `subjectId` in its
  metadata because the actor *is* the subject — they already know their own access changed, so no
  notification is generated. This falls out of the generic rule rather than needing a special
  case.
- **`COMMENT`** — the recipient is the commented-on resource's owner (looked up via
  `FolderRepository`/`FileRepository`'s unscoped `findByIdUnscoped`), skipped if the owner is
  commenting on their own resource.
- **`SHARE`** — only the create-invitation variant names anyone (`metadata.invitedEmail`),
  resolved to a local account via `UserRepository.findByEmail` if one already exists; the
  create-shared-link variant has no addressable recipient (a link isn't granted to a specific
  person) and is always skipped. An invited email with no local account yet gets no in-app
  notification — the invitation email (`EmailAdapter`, see docs/permissions.md) is the
  only signal until they sign up.

Every notification the listener creates is also pushed live via
`realtimeEmitter.emitToUser(recipientId, 'notification:new', notification)`. `notification:new` is
a real Notification row's shape sent immediately after it's written — the frontend's
`useNotificationsRealtimeSync` hook shows a toast off the payload and invalidates the
notifications/unread-count queries, so an already-open tab doesn't need to poll or refresh to
learn about it.

REST surface: `GET /notifications` (cursor-paginated, `unreadOnly` filter), `GET
/notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.

### Ephemeral upload-sync events (no table)

Per-part upload progress happens far too often to persist, and nobody needs to see it again after
their tabs are closed — so `upload:started` / `upload:progress` / `upload:completed` /
`upload:failed` / `upload:aborted` bypass `ActivityEvent`/`Notification` entirely.
`InitiateUploadUseCase`, `ReportUploadPartUseCase`, `AbortUploadUseCase`, and
`VerifyChecksumUseCase` each call `realtimeEmitter.emitToUser` directly (see
`apps/api/src/modules/uploads/domain/upload-events.ts` for the event-name constants). Since these
land in the same `user:{userId}` room as everything else, every tab the uploading user has open
receives them — including the tab that started the upload, which already reflects its own
progress locally and needs to ignore its own echo (see Frontend below).

## Frontend

`RealtimeProvider` (`apps/web/src/lib/realtime-context.tsx`) opens one `socket.io-client`
connection per signed-in session, wrapping the whole app inside `Providers`. The `auth` option is
a callback (not a plain object) so a token that expires mid-session gets refreshed via Clerk's
`getToken()` on every reconnection attempt rather than reusing a stale one from first connect.
`useRealtimeSocket()` hands out the shared `Socket` instance (or `null` before connection) to
anything that needs to listen.

**Notifications**: `NotificationBell` (mounted in the drive layout header) combines
`useNotifications`/`useUnreadCount` (react-query) with `useNotificationsRealtimeSync`, which
listens for `notification:new`, invalidates both queries, and shows a toast built from the same
`describeNotification` function the dropdown list uses — one source of truth for "what does this
notification mean." `Notification.payload` carries both the raw ids (`actorId`/`targetId`/
`subjectId`) and resolved display names (`actorName`, `targetName`, and — for an ORGANIZATION-
subject `QUOTA_WARNING` — `subjectName`), resolved server-side by `NotificationEventListener`/
`QuotaNotificationListener` at creation time rather than left to the frontend to re-look-up, so
`describeNotification` can say "Jane shared \"Q3 Report.pdf\"" instead of a generic "You were
invited to a file."

**Cross-tab upload sync**: `upload-manager.ts`'s `activeUploads` map is keyed by a client-generated
`clientId`, but socket events only carry the server's `uploadId` — a tab that didn't initiate an
upload has no `clientId` for it. `findClientIdForServerUploadId(serverUploadId)` bridges the two;
`applyRemoteUploadEvent` (wired up by `useUploadRealtimeSync`, mounted once in
`UploadProgressPanel`) uses it to decide, per event, whether this tab is the initiator (in which
case its own `runUpload` loop already reflects the change — the event is a no-op here) or an
observer (in which case it upserts/updates a store entry keyed directly by the server's
`uploadId`, since it has no `clientId` of its own). `isLocallyTracked` additionally gates the
pause/resume/cancel buttons in the progress panel — a mirrored entry has nothing in this tab to
pause.

## Known gaps

- **No per-resource rooms or "someone is viewing this file" presence.** The roadmap called this
  out as an explicit stretch goal ("document as stretch if time-constrained") — only the per-user
  room needed for notifications and cross-tab upload sync was built.
- **No horizontal-scaling story for Socket.io.** `RealtimeEmitter` calls `server.to(room).emit(...)`
  against a single in-process `Server` instance. This works today because the checksum-verification
  BullMQ worker already runs in the same Node process as the API (see M3), so there's no
  cross-process signaling problem to solve yet — but a second API instance behind a load balancer
  would need `@socket.io/redis-adapter` to fan events out across instances, which isn't installed.
- **No end-to-end test drives two authenticated browser sessions against the real gateway.** Socket
  handshake auth, event→notification translation, and upload-sync reconciliation are each covered
  by focused unit tests (see Milestone 8 completion notes), and the cross-tab upload-sync
  acceptance criterion was verified live with two tabs of the *same* signed-in session — but no
  automated test simulates two distinct users' sockets connected simultaneously.
