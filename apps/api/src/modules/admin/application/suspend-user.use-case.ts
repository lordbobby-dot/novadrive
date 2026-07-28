import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ClerkClient } from '@clerk/backend';
import { CLERK_CLIENT } from '../../auth/infrastructure/clerk-client.provider';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import type { User } from '../../users/domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';

@Injectable()
export class SuspendUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLERK_CLIENT) private readonly clerkClient: ClerkClient,
    private readonly events: EventEmitter2,
  ) {}

  async execute(adminId: string, targetUserId: string): Promise<User> {
    // Self-lockout protection — mirrors M10's guard against an org owner demoting/removing
    // themselves. Without this, the only admin on a fresh install could suspend their own
    // account with no other admin left to reverse it.
    if (adminId === targetUserId) {
      throw new BadRequestException('Cannot suspend your own account');
    }

    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.isSuspended) {
      return target;
    }

    // Revokes every live session immediately — see the doc-comment on User.isSuspended.
    await this.clerkClient.users.banUser(target.clerkId);
    const updated = await this.users.setSuspended(targetUserId, true);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'USER_SUSPENDED',
        'SUCCESS',
        adminId,
        'USER',
        targetUserId,
        {
          targetEmail: target.email,
        },
      ),
    );

    return updated;
  }
}
