import { randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EnvConfig } from '../../../config/env.validation';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import {
  roleMeetsMinimum,
  type PermissionRoleName,
  type ResourceTypeName,
} from '../../sharing/domain/permission.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organizations/domain/organization.repository';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import type { Invitation } from '../domain/invitation.entity';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../domain/invitation.repository';
import { EMAIL_ADAPTER, type EmailAdapter } from '../domain/email-adapter';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateInvitationParams {
  inviterId: string;
  email: string;
  resourceType: ResourceTypeName;
  resourceId: string;
  role: PermissionRoleName;
}

/** Invitations (email-addressed, async accept) are the path for inviting someone who may not
 * have an account yet — as opposed to Permission grants (SharingModule), which are for an
 * already-known user id. Requires ADMIN+ on the resource, same threshold as a direct grant, and
 * additionally that the inviter's own role outranks — or matches — the role being invited at,
 * mirroring GrantPermissionUseCase's escalation guard exactly (an ADMIN inviting someone
 * straight in as OWNER would otherwise bypass the same check a direct grant already enforces).
 * ORGANIZATION invites are authorized against OrgRoleResolver instead of PermissionResolver
 * (which only understands FILE/FOLDER) — everything else about the flow is identical. */
@Injectable()
export class CreateInvitationUseCase {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter: EmailAdapter,
    private readonly resolver: PermissionResolver,
    private readonly orgRoles: OrgRoleResolver,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(params: CreateInvitationParams): Promise<Invitation> {
    const { inviterId, email, resourceType, resourceId, role } = params;

    const inviterRole =
      resourceType === 'ORGANIZATION'
        ? await this.orgRoles.requireRole(inviterId, resourceId, 'ADMIN')
        : await this.resolver.requireRole(
            inviterId,
            resourceType,
            resourceId,
            'ADMIN',
          );
    if (!roleMeetsMinimum(inviterRole, role)) {
      this.events.emit(
        AUDIT_EVENT,
        new AuditEvent(
          'PERMISSION_ESCALATION_ATTEMPT',
          'FAILURE',
          inviterId,
          resourceType,
          resourceId,
          { invitedEmail: email, attemptedRole: role, inviterRole },
        ),
      );
      throw new ForbiddenException(
        "Can't invite someone to a role higher than your own",
      );
    }

    const resourceName = await this.resolveResourceName(
      resourceType,
      resourceId,
    );
    const inviter = await this.users.findById(inviterId);
    if (!inviter) throw new NotFoundException('Inviter not found');

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.invitations.create({
      email,
      resourceType,
      resourceId,
      role,
      token,
      invitedBy: inviterId,
      expiresAt,
    });

    const frontendUrl = this.config.get('CORS_ORIGIN', { infer: true });
    await this.emailAdapter.sendInvitation({
      to: email,
      inviterName: inviter.name ?? inviter.email,
      resourceName,
      role,
      acceptUrl: `${frontendUrl}/invitations/${token}`,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(inviterId, 'SHARE', resourceType, resourceId, {
        invitedEmail: email,
        role,
      }),
    );

    return invitation;
  }

  private async resolveResourceName(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<string> {
    if (resourceType === 'ORGANIZATION') {
      const org = await this.organizations.findById(resourceId);
      if (!org) throw new NotFoundException('Organization not found');
      return org.name;
    }
    if (resourceType === 'FOLDER') {
      const folder = await this.folders.findByIdUnscoped(resourceId);
      if (!folder) throw new NotFoundException('Folder not found');
      return folder.name;
    }
    const file = await this.files.findByIdUnscoped(resourceId);
    if (!file) throw new NotFoundException('File not found');
    return file.name;
  }
}
