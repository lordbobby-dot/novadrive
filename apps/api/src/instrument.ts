// Sentry's own docs require this to be the very first import in the process — before Nest,
// before anything else — so it can hook into whatever it needs to before other modules load.
// Imported ahead of `./tracing` in main.ts is fine either way here: deliberately configured
// WITHOUT `tracesSampleRate`/`tracesSampler` below, so Sentry only does error capture and never
// stands up its own (OpenTelemetry-based) tracer provider — that would otherwise compete with
// the separate, purpose-built `NodeSDK` in `./tracing.ts` for the single global tracer provider
// a process can have. Error monitoring (this file) and distributed tracing (tracing.ts) are two
// separate roadmap concerns kept deliberately non-overlapping at the SDK level.
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
  });

  console.log('[sentry] error monitoring initialized');
} else {
  console.log('[sentry] SENTRY_DSN not set — error monitoring disabled');
}
