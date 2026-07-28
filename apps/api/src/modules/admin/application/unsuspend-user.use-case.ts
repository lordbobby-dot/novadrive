import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
export class UnsuspendUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLERK_CLIENT) private readonly clerkClient: ClerkClient,
    private readonly events: EventEmitter2,
  ) {}

  async execute(adminId: string, targetUserId: string): Promise<User> {
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (!target.isSuspended) {
      return target;
    }

    await this.clerkClient.users.unbanUser(target.clerkId);
    const updated = await this.users.setSuspended(targetUserId, false);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'USER_UNSUSPENDED',
        'SUCCESS',
        adminId,
        'USER',
        targetUserId,
        { targetEmail: target.email },
      ),
    );

    return updated;
  }
}
