import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { verifyToken, type ClerkClient } from '@clerk/backend';
import type { EnvConfig } from '../../../config/env.validation';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import type { User } from '../../users/domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import { SyncClerkUserUseCase } from '../../users/application/sync-clerk-user.use-case';
import { CLERK_CLIENT } from '../infrastructure/clerk-client.provider';

/** Shared by ClerkAuthGuard (HTTP) and RealtimeGateway (Socket.io handshake) so both
 * entry points verify tokens and resolve local users identically. */
@Injectable()
export class AuthenticateWithClerkTokenUseCase {
  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(CLERK_CLIENT) private readonly clerkClient: ClerkClient,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly syncClerkUser: SyncClerkUserUseCase,
    private readonly events: EventEmitter2,
  ) {}

  async execute(token: string): Promise<User> {
    let clerkId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.config.get('CLERK_SECRET_KEY', { infer: true }),
      });
      clerkId = payload.sub;
    } catch {
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'AUTH_TOKEN_REJECTED',
          'FAILURE',
          null,
          undefined,
          undefined,
          {
            reason: 'invalid_or_expired',
          },
        ),
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.resolveLocalUser(clerkId);
    if (user.isSuspended) {
      // Defense in depth alongside Clerk's own banUser (which revokes sessions immediately) —
      // rejects even a JWT that was minted just before the ban propagated. See SuspendUserUseCase.
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'AUTH_TOKEN_REJECTED',
          'FAILURE',
          user.id,
          'USER',
          user.id,
          { reason: 'account_suspended' },
        ),
      );
      throw new UnauthorizedException('Account suspended');
    }

    return user;
  }

  private async resolveLocalUser(clerkId: string): Promise<User> {
    const existing = await this.users.findByClerkId(clerkId);
    if (existing) {
      return existing;
    }

    // Defensive fallback: syncs eagerly in case the Clerk webhook hasn't landed yet
    // (e.g. local dev without a reachable webhook endpoint, or event delivery lag).
    const clerkUser = await this.clerkClient.users.getUser(clerkId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;

    if (!primaryEmail) {
      throw new UnauthorizedException(
        'Clerk user has no primary email address',
      );
    }

    return this.syncClerkUser.execute({
      clerkId: clerkUser.id,
      email: primaryEmail,
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
        null,
      avatarUrl: clerkUser.imageUrl || null,
    });
  }
}
