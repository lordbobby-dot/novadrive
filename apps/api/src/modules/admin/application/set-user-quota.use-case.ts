import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from '../../quota/domain/storage-quota.repository';
import type { AdminUserSummary } from './list-admin-users.use-case';

@Injectable()
export class SetUserQuotaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    adminId: string,
    targetUserId: string,
    limitBytes: string,
  ): Promise<AdminUserSummary> {
    // class-validator's @IsNumberString already rejected anything non-numeric before this runs —
    // this guards the *value*, not the shape: a limit of 0 or negative would let a user store
    // nothing (or trip the BigInt comparison in tryReserve in surprising ways).
    if (BigInt(limitBytes) <= 0n) {
      throw new BadRequestException(
        'limitBytes must be a positive number of bytes',
      );
    }

    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const quota = await this.quotas.setLimit('USER', targetUserId, limitBytes);

    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'USER_QUOTA_UPDATED',
        'SUCCESS',
        adminId,
        'USER',
        targetUserId,
        { targetEmail: target.email, limitBytes },
      ),
    );

    return {
      ...target,
      storageUsedBytes: quota.usedBytes,
      storageLimitBytes: quota.limitBytes,
    };
  }
}
