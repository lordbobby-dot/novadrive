import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import type { User } from '../../users/domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';

@Injectable()
export class SetSystemAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    adminId: string,
    targetUserId: string,
    isSystemAdmin: boolean,
  ): Promise<User> {
    // Self-lockout protection, same rationale as SuspendUserUseCase — an admin can promote
    // others freely, and demote a *different* admin, but never their own last line of access.
    if (adminId === targetUserId && !isSystemAdmin) {
      throw new BadRequestException('Cannot revoke your own admin role');
    }

    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.isSystemAdmin === isSystemAdmin) {
      return target;
    }

    const updated = await this.users.setSystemAdmin(
      targetUserId,
      isSystemAdmin,
    );

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        isSystemAdmin ? 'ADMIN_ROLE_GRANTED' : 'ADMIN_ROLE_REVOKED',
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
