import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** pino-http's `genReqId` (configured in LoggerModule) stamps `request.id` on every request —
 * this decorator just surfaces that same id to a controller so it can be threaded explicitly
 * into a use case and from there into a BullMQ job payload. See docs/observability.md for why
 * this is passed explicitly rather than resolved via request-scoped DI (which would make the
 * use case request-scoped, with real performance cost, for a single string value). */
export const CorrelationId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { id?: string }>();
    return request.id;
  },
);
