# Observability

Structured logging, correlation IDs, health checks, metrics, distributed tracing, and error
monitoring for `apps/api` and `apps/web`. Every integration in this milestone follows the same
env-gated-optionality pattern used throughout the project (Clerk, AWS, quota emails): unset an env
var and the integration is inert — no crash, no log spam, no connection attempts against nothing.

## Structured logging (`apps/api`)

All API logs are JSON (via `nestjs-pino`), one line per event, to stdout. `LOG_LEVEL` (default
`info`) controls verbosity. In development, a `pino-pretty` transport renders them human-readably;
in every other `NODE_ENV`, raw JSON is emitted for log-aggregator ingestion.

Every HTTP request/response is logged automatically by `pino-http` with a `req.id` field. `req.id`
is either the incoming `x-request-id` header (if the caller — a load balancer, another service, an
end-to-end test — already set one) or a freshly generated UUID (`genReqId` in
[`logger.module.ts`](../apps/api/src/infrastructure/logging/logger.module.ts)). The same ID is
echoed back on the response as `x-request-id`, so a client can correlate its own request with the
server's logs.

`req.headers.authorization`, `req.headers.cookie`, and `res.headers["set-cookie"]` are redacted
from every log line.

### Correlation IDs through background jobs

The acceptance criterion is: **every log line for a unit of work — HTTP request or background
job — carries the same correlation ID, traceable end to end.** This is implemented as an explicit
parameter, not request-scoped DI (a real per-request performance cost for what's just one string):

1. A controller reads the ID via the `@CorrelationId()` param decorator (mirrors `@CurrentUser()`),
   which pulls `request.id` — the same ID `pino-http` already assigned.
2. The ID is passed into the use case as a plain parameter (e.g.
   `CompleteUploadParams.correlationId`).
3. The use case includes it in the BullMQ job payload (e.g. `ChecksumVerificationJob.correlationId`).
4. The processor reads `job.data.correlationId` and includes it in every log line for that job via
   `PinoLogger` (e.g. `this.logger.info({ correlationId, storageObjectId }, ...)`).

Grep any API log file for a request's `req.id` and you'll find the exact same value on every log
line emitted by the background job(s) it triggered. Jobs with no originating HTTP request (e.g.
`TrashCleanupProcessor`'s cron-triggered runs) generate their own correlation ID per run instead.

Covered by unit tests: [`complete-upload.use-case.spec.ts`](../apps/api/src/modules/uploads/application/complete-upload.use-case.spec.ts)
(the ID flows from params into the job payload) and
[`checksum-verification.processor.spec.ts`](../apps/api/src/modules/uploads/infrastructure/checksum-verification.processor.spec.ts)
(the ID flows from the job payload into the logger).

## Health checks

- **`GET /health`** — liveness only. Returns `{ status: 'ok', timestamp }` unconditionally; never
  touches a dependency. For "is the process up," not "is it useful."
- **`GET /health/ready`** — readiness. Checks Postgres (`SELECT 1`), Redis (`.info()` on the BullMQ
  client — BullMQ's `IRedisClient` abstraction has no `.ping()`, but `.info()` is implemented by
  every adapter and makes an equally real round trip), and S3 (`HeadBucketCommand`), in parallel.
  Returns `200` with `{ status: 'ok', database, redis, s3 }` if all three are up, or `503` with
  `{ status: 'unhealthy', ... }` (each check still individually reported) if any is down. Point a
  load balancer or orchestrator's readiness probe here, not at `/health`.

Both public routes (`@Public()` — no Clerk auth required, since infrastructure probes can't
authenticate).

`DependencyHealthService` (in `src/infrastructure/health/`) is the single implementation of these
three checks, shared by `GET /health/ready` and the admin-only `GET /admin/system-health` (which
layers BullMQ queue depth on top — see [`docs/admin.md`](admin.md)). It was extracted from M13's
originally-inline `GetSystemHealthUseCase` logic once a second consumer needed it.

Covered by [`dependency-health.service.spec.ts`](../apps/api/src/infrastructure/health/dependency-health.service.spec.ts)
(every up/down permutation), [`get-readiness.use-case.spec.ts`](../apps/api/src/infrastructure/health/get-readiness.use-case.spec.ts),
[`health.controller.spec.ts`](../apps/api/src/modules/health/interface/health.controller.spec.ts),
and — at the integration level — [`test/health.e2e-spec.ts`](../apps/api/test/health.e2e-spec.ts),
which boots the real app with `DependencyHealthService` DI-overridden to force each dependency down
in turn and asserts the resulting `503` and per-dependency detail.

## Metrics (`GET /metrics`)

Public (`@Public()`), unauthenticated, Prometheus-text-format endpoint powered by `prom-client`.
Exposes:

- **`http_request_duration_seconds`** (histogram) — labeled by `method`, `route` (the Express
  route pattern, e.g. `/files/:id`, never the literal path — unbounded literal paths would blow up
  cardinality), and `status_code`. Recorded by a global `MetricsInterceptor` around every request.
- **`queue_depth`** (gauge) — labeled by `queue` and `state` (`waiting`/`active`/`failed`/
  `delayed`). Polled every 15s from both BullMQ queues by `QueueMetricsCollector`.
- **`upload_throughput_bytes_total`** (counter) — incremented by the completed upload's byte size
  in `VerifyChecksumUseCase`, on both the new-file and new-version-of-file success paths.
- Node.js default process metrics (`collectDefaultMetrics` — heap, event loop lag, GC, etc.), for
  free.

Point a Prometheus scrape config at `GET /metrics`; any Grafana dashboard built on the above metric
names will render request latency percentiles, queue backlog, and upload volume over time.

## Distributed tracing (OpenTelemetry)

Gated entirely behind `OTEL_EXPORTER_OTLP_ENDPOINT`. Unset (the default in this dev environment),
`src/tracing.ts` logs `[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled` and never
starts a `NodeSDK` — no attempt against a default endpoint nothing is listening on, no error spam.

When set (e.g. to a local Jaeger/Tempo/collector's `http://localhost:4318`), traces export to
`${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`, instrumented via:

- `getNodeAutoInstrumentations()` — covers HTTP (incoming/outgoing), and — because BullMQ's
  underlying transport is ioredis — every Redis call BullMQ itself makes. (No official BullMQ
  OpenTelemetry instrumentation package exists as of this writing.)
- `PrismaInstrumentation()` — every Prisma query becomes a span.
- Manual `tracer.startActiveSpan(...)` around each BullMQ processor's `process()` method
  (`checksum-verification.process`, `trash-cleanup.process`), tagged with `correlationId` and the
  relevant entity ID — this is the job-level granularity standing in for the missing official
  instrumentation.

`OTEL_SERVICE_NAME` (default `novadrive-api`) tags the resulting spans' service name.

`import './instrument'; import './tracing';` are the literal first two lines of `main.ts` —
OpenTelemetry's auto-instrumentation patches modules via `require`-hooking, which only affects
modules not yet imported at patch-registration time.

## Error monitoring (Sentry)

### `apps/api`

Gated behind `SENTRY_DSN`. `src/instrument.ts` (imported first in `main.ts`, ahead of NestJS
itself) calls `Sentry.init({ dsn, environment })` **without** `tracesSampleRate`/`tracesSampler`.
This is deliberate: modern Sentry SDKs stand up their own OpenTelemetry tracer provider when
tracing is enabled, and a Node process can only have one global tracer provider. Since `tracing.ts`
(above) is the app's chosen tracer-provider owner, Sentry here is kept to error-capture only —
`SentryGlobalFilter` (registered as the app's global exception filter) reports uncaught exceptions,
nothing more.

### `apps/web`

Gated behind `NEXT_PUBLIC_SENTRY_DSN`. Uses the modern Next.js instrumentation-hook pattern (no
`sentry.server.config.ts`/`sentry.client.config.ts` files):

- **`src/instrumentation.ts`** — `register()` initializes Sentry for the `nodejs` and `edge`
  runtimes (server-side rendering, route handlers, middleware); `onRequestError` (exported from the
  same file) reports server-side render errors that Next.js's own error boundary can't catch.
- **`src/instrumentation-client.ts`** — initializes Sentry in the browser with `tracesSampleRate:
  1.0`. This single setting is what enables **Web Vitals reporting**: Sentry's browser SDK
  automatically instruments pageload/navigation spans and attaches Core Web Vitals (LCP, CLS, INP,
  FCP, TTFB) as span measurements — no separate `useReportWebVitals` wiring needed. It also exports
  `onRouterTransitionStart` so App Router client-side navigations are captured as spans, not just
  full page loads.
- **`src/app/global-error.tsx`** — required by Next.js App Router for Sentry to catch React render
  errors that escape every other error boundary; reports via `Sentry.captureException` in a
  `useEffect`.
- **`next.config.ts`**'s `withSentryConfig(...)` wraps the build to upload source maps for readable
  stack traces — skipped automatically when `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` are
  unset (the same optionality pattern, one level up: the wrapper itself never fails a build over
  missing upload credentials, it just skips the upload step).

## Reading the pieces together

Given a slow or failing request end-to-end:

1. Find the request in API logs by user report or time window; note its `req.id`
   (also returned to the client via the `x-request-id` response header).
2. Grep every subsequent log line for that same ID — HTTP log line, any BullMQ job it enqueued,
   including the job's OpenTelemetry span if tracing is enabled (trace/span IDs appear alongside
   `correlationId` in job logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set).
3. Check `GET /metrics`' `http_request_duration_seconds` for whether this route is generally slow,
   or `queue_depth` for whether jobs were backed up at the time.
4. If an exception was thrown, it's in Sentry (both apps) with a full stack trace (source-mapped on
   the frontend when configured) and — for the API — the same request context Sentry's Nest
   integration attaches automatically.
5. `GET /health/ready` and `GET /admin/system-health` (richer, admin-only, includes queue depth)
   answer "was a dependency down at the time."
