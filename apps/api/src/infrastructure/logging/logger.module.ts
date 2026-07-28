import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EnvConfig } from '../../config/env.validation';

const REQUEST_ID_HEADER = 'x-request-id';

/** Every request gets a correlation id — reused from an incoming `x-request-id` header if the
 * caller (or a load balancer) already set one, otherwise generated fresh — echoed back on the
 * response so a client can correlate its own logs too. `CorrelationId()` (see
 * common/decorators/correlation-id.decorator.ts) surfaces the same value to controllers that
 * need to thread it into a background job payload. */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers[REQUEST_ID_HEADER];
              const id =
                (Array.isArray(existing) ? existing[0] : existing) ||
                randomUUID();
              res.setHeader(REQUEST_ID_HEADER, id);
              return id;
            },
            // Never log credentials/cookies/tokens, even at debug level.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },
            transport: isDev
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
