import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Registered globally (see MetricsModule) — records every HTTP request's duration regardless of
 * outcome (success, thrown exception, or validation rejection all still hit `tap`'s `error`/
 * `next` branches). Skips non-HTTP contexts (the WebSocket gateway) since `http_request_duration`
 * is meaningless there. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();
    // Nest's routed pattern (e.g. "/files/:id") rather than the literal path — keeps cardinality
    // bounded regardless of how many distinct file/folder ids are ever requested.
    const route =
      (request.route as { path?: string } | undefined)?.path ?? request.path;

    const record = () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpRequestDuration.observe(
        {
          method: request.method,
          route,
          status_code: String(response.statusCode),
        },
        seconds,
      );
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
