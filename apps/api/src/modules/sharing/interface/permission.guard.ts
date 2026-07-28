import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '../../users/domain/user.entity';
import { PermissionResolver } from '../domain/permission-resolver.service';
import {
  PermissionCheck,
  REQUIRE_PERMISSION_KEY,
} from './require-permission.decorator';

/** Global guard (registered via APP_GUARD, like ClerkAuthGuard) — a no-op unless the handler
 * declares `@RequirePermission(...)`. Runs after ClerkAuthGuard in the guard chain, so
 * `request.user` is already populated. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const checks = this.reflector.get<PermissionCheck[] | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!checks || checks.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: User }>();
    const actorId = request.user.id;

    for (const check of checks) {
      let resourceId: unknown;
      if (check.source === 'params') {
        resourceId = request.params[check.field];
      } else if (check.source === 'query') {
        resourceId = request.query[check.field];
      } else {
        resourceId = (request.body as Record<string, unknown> | undefined)?.[
          check.field
        ];
      }

      if (!resourceId || typeof resourceId !== 'string') {
        if (check.optional && !resourceId) continue;
        throw new BadRequestException(
          `Missing required field "${check.field}" for permission check`,
        );
      }

      await this.resolver.requireRole(
        actorId,
        check.resourceType,
        resourceId,
        check.minimumRole,
      );
    }

    return true;
  }
}
