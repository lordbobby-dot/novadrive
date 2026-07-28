import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_ADMIN_ROUTE_KEY } from '../../../common/decorators/require-admin.decorator';
import type { User } from '../../users/domain/user.entity';

/** Global guard (registered via APP_GUARD, like ClerkAuthGuard/PermissionGuard) — a no-op unless
 * the handler or controller declares `@RequireAdmin()`. Runs after ClerkAuthGuard in the guard
 * chain, so `request.user` is already populated. Unlike PermissionGuard, there's no per-resource
 * resolution needed — isSystemAdmin is a flat platform-wide flag on the authenticated user. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresAdmin = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresAdmin) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: User }>();
    if (!request.user.isSystemAdmin) {
      throw new ForbiddenException('System admin role required');
    }
    return true;
  }
}
