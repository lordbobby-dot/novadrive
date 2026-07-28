import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import { PermissionResolver } from '../domain/permission-resolver.service';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../domain/permission.repository';

@Injectable()
export class RevokePermissionUseCase {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    private readonly resolver: PermissionResolver,
    private readonly events: EventEmitter2,
  ) {}

  async execute(actorId: string, permissionId: string): Promise<void> {
    const permission = await this.permissions.findById(permissionId);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.resolver.requireRole(
      actorId,
      permission.resourceType,
      permission.resourceId,
      'ADMIN',
    );

    await this.permissions.delete(permissionId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        actorId,
        'PERMISSION_CHANGE',
        permission.resourceType,
        permission.resourceId,
        { subjectId: permission.subjectId, revoked: true },
      ),
    );
    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'PERMISSION_REVOKED',
        'SUCCESS',
        actorId,
        permission.resourceType,
        permission.resourceId,
        { subjectId: permission.subjectId },
      ),
    );
  }
}
