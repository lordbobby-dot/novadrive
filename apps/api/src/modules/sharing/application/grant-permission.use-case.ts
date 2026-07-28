import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import { PermissionResolver } from '../domain/permission-resolver.service';
import {
  Permission,
  PermissionRoleName,
  ResourceTypeName,
  roleMeetsMinimum,
} from '../domain/permission.entity';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../domain/permission.repository';

export interface GrantPermissionParams {
  granterId: string;
  subjectId: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
}

/** Granting a role requires ADMIN+ on the resource (enforced by the caller/guard already having
 * required at least ADMIN to reach this use case) and additionally that the granter's own role
 * outranks — or matches — the role being handed out, so an ADMIN can't mint another OWNER. */
@Injectable()
export class GrantPermissionUseCase {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    private readonly resolver: PermissionResolver,
    private readonly events: EventEmitter2,
  ) {}

  async execute(params: GrantPermissionParams): Promise<Permission> {
    const { granterId, subjectId, resourceType, resourceId, role } = params;

    if (subjectId === granterId) {
      throw new BadRequestException("Can't grant a permission to yourself");
    }

    const granterRole = await this.resolver.requireRole(
      granterId,
      resourceType,
      resourceId,
      'ADMIN',
    );
    if (!roleMeetsMinimum(granterRole, role)) {
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'PERMISSION_ESCALATION_ATTEMPT',
          'FAILURE',
          granterId,
          resourceType,
          resourceId,
          { subjectId, attemptedRole: role, granterRole },
        ),
      );
      throw new ForbiddenException("Can't grant a role higher than your own");
    }

    const permission = await this.permissions.upsert({
      subjectId,
      resourceType,
      resourceId,
      role,
      grantedBy: granterId,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(
        granterId,
        'PERMISSION_CHANGE',
        resourceType,
        resourceId,
        {
          subjectId,
          role,
        },
      ),
    );
    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        'PERMISSION_GRANTED',
        'SUCCESS',
        granterId,
        resourceType,
        resourceId,
        { subjectId, role },
      ),
    );

    return permission;
  }
}
