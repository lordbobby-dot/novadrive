// Must be the very first thing `main.ts` imports — OpenTelemetry's auto-instrumentation patches
// modules (http, express, ioredis, aws-sdk, ...) via require-in-the-middle hooks that only take
// effect if registered before those modules are first `require`d anywhere in the process. Once
// `AppModule` (and everything it transitively imports — Nest, Prisma, the AWS SDK) has been
// required even once, patching them is too late.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

/** Tracing is entirely opt-in via OTEL_EXPORTER_OTLP_ENDPOINT (no collector configured = no SDK
 * started at all) — the same "absent env var means the integration is inert, not broken" pattern
 * this project already uses for Clerk/AWS/Sentry. Starting an exporter against a default
 * localhost:4318 with nothing listening would just spam connection-refused errors for no signal;
 * skipping entirely when unset is more honest than a fake no-op exporter. */
if (otlpEndpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'novadrive-api',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.1',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Extremely chatty (every fs.stat/readFile call) for near-zero signal in this app.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
      // No official BullMQ instrumentation package exists. BullMQ's underlying ioredis calls are
      // still covered by instrumentation-ioredis (bundled in getNodeAutoInstrumentations above);
      // job-level spans are created manually in each Processor — see checksum-verification and
      // trash-cleanup processors.
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  console.log(`[otel] tracing started, exporting to ${otlpEndpoint}`);

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
} else {
  console.log('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
}
