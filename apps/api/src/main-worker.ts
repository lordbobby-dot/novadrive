// Same load-order requirement as main.ts — see the doc-comments in each file for why.
import './instrument';
import './tracing';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Standalone entrypoint for a worker-only process: same module graph as the API (`AppModule`),
 * started via `createApplicationContext` instead of `NestFactory.create` — no HTTP adapter is
 * ever constructed, so there's no port to bind and no HTTP-pipeline setup (helmet, CORS,
 * ValidationPipe, Swagger) to run. What *does* start is everything DI-driven: the four BullMQ
 * `WorkerHost` processors (checksum verification, abandoned-upload cleanup, trash cleanup, audit
 * log purge) and their schedulers, all still declared inside their owning feature modules exactly
 * as when the API hosts them — see docs/deployment.md's "Scaling notes" section for why reusing
 * the same module graph was chosen over hand-splitting each feature module into producer-only vs
 * consumer-only halves.
 *
 * RealtimeGateway (a `@WebSocketGateway()` inside RealtimeModule, transitively imported via
 * UploadsModule/TrashModule) is instantiated as a provider like anything else, but its actual
 * socket.io binding only happens through `NestApplication`'s HTTP-adapter-bound bootstrap
 * sequence — `NestApplicationContext` never runs that step, so the gateway stays a harmless,
 * dormant provider here rather than erroring for lack of an HTTP server to attach to.
 *
 * Deployed as docker-compose.prod.yml's `worker` service, sharing the same Postgres/Redis/S3 as
 * `api` — see that file and docs/deployment.md for the env vars and healthcheck approach (a
 * process-liveness check, since there's no HTTP endpoint to probe).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  logger.log(
    'NovaDrive worker started — processing BullMQ queues, no HTTP listener',
  );

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received, shutting down worker`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
void bootstrap();
