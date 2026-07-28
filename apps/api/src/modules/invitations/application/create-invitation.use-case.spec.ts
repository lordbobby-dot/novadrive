import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateInvitationUseCase } from './create-invitation.use-case';
import type { EnvConfig } from '../../../config/env.validation';
import type { Invitation } from '../domain/invitation.entity';
import type { InvitationRepository } from '../domain/invitation.repository';
import type { EmailAdapter } from '../domain/email-adapter';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { Organization } from '../../organizations/domain/organization.entity';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invite-1',
    email: 'friend@example.com',
    resourceType: 'FILE',
    resourceId: 'file-1',
    role: 'EDITOR',
    token: 'tok_abc',
    invitedBy: 'inviter-1',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 86400_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'inviter-1',
    clerkId: 'clerk-1',
    email: 'inviter@example.com',
    name: 'Inviter',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'inviter-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-1',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/inviter-1/abc',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CreateInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationRepository>;
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let users: jest.Mocked<UserRepository>;
  let organizations: jest.Mocked<OrganizationRepository>;
  let emailAdapter: jest.Mocked<EmailAdapter>;
  let resolver: jest.Mocked<PermissionResolver>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let events: { emit: jest.Mock };
  let useCase: CreateInvitationUseCase;

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      updateStatus: jest.fn(),
      listForResource: jest.fn(),
    };
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    files = {
      findById: jest.fn(),
      create: jest.fn(),
      createFromStorageObject: jest.fn(),
      rename: jest.fn(),
      findByFolder: jest.fn(),
      move: jest.fn(),
      copyToNewStorageObject: jest.fn(),
      softDelete: jest.fn(),
      softDeleteByFolderIds: jest.fn(),
      restore: jest.fn(),
      restoreByFolderIds: jest.fn(),
      findByFolderIds: jest.fn(),
      updateCurrentStorageObject: jest.fn(),
      touchLastAccessed: jest.fn(),
      isTrashed: jest.fn(),
      findByIdUnscoped: jest.fn(),
    };
    users = {
      findByClerkId: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn(),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    organizations = {
      create: jest.fn(),
      findById: jest.fn(),
      listForActor: jest.fn(),
      listAll: jest.fn(),
      rename: jest.fn(),
      transferOwnership: jest.fn(),
      delete: jest.fn(),
    };
    emailAdapter = { sendInvitation: jest.fn() };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    events = { emit: jest.fn() };
    const config = {
      get: jest.fn(() => 'https://app.example.com'),
    } as unknown as ConfigService<EnvConfig, true>;
    useCase = new CreateInvitationUseCase(
      invitations,
      folders,
      files,
      users,
      organizations,
      emailAdapter,
      resolver,
      orgRoles,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
      config,
    );
  });

  it('requires ADMIN+ on the resource before inviting', async () => {
    resolver.requireRole.mockRejectedValue(new Error('forbidden'));
    await expect(
      useCase.execute({
        inviterId: 'inviter-1',
        email: 'friend@example.com',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
      }),
    ).rejects.toThrow('forbidden');
    expect(invitations.create).not.toHaveBeenCalled();
  });

  it('404s when the resource no longer exists', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    files.findByIdUnscoped.mockResolvedValue(null);

    await expect(
      useCase.execute({
        inviterId: 'inviter-1',
        email: 'friend@example.com',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the inviter no longer exists', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    users.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        inviterId: 'inviter-1',
        email: 'friend@example.com',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates the invitation, sends the email, and emits a SHARE activity event', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    users.findById.mockResolvedValue(makeUser());
    invitations.create.mockResolvedValue(makeInvitation());

    await useCase.execute({
      inviterId: 'inviter-1',
      email: 'friend@example.com',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'EDITOR',
    });

    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'friend@example.com',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'EDITOR',
        invitedBy: 'inviter-1',
      }),
    );
    expect(emailAdapter.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com',
        resourceName: 'report.pdf',
        role: 'EDITOR',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'inviter-1',
        action: 'SHARE',
        targetType: 'FILE',
        targetId: 'file-1',
      }),
    );
  });

  it("rejects inviting someone to a FILE/FOLDER role higher than the inviter's own", async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');

    await expect(
      useCase.execute({
        inviterId: 'inviter-1',
        email: 'friend@example.com',
        resourceType: 'FILE',
        resourceId: 'file-1',
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitations.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'PERMISSION_ESCALATION_ATTEMPT' }),
    );
  });

  it('allows an OWNER inviter to invite someone else as OWNER', async () => {
    resolver.requireRole.mockResolvedValue('OWNER');
    files.findByIdUnscoped.mockResolvedValue(makeFile());
    users.findById.mockResolvedValue(makeUser());
    invitations.create.mockResolvedValue(makeInvitation({ role: 'OWNER' }));

    await useCase.execute({
      inviterId: 'inviter-1',
      email: 'friend@example.com',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'OWNER',
    });

    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'OWNER' }),
    );
  });

  it("rejects inviting someone to an ORGANIZATION role higher than the inviter's own", async () => {
    orgRoles.requireRole.mockResolvedValue('ADMIN');

    await expect(
      useCase.execute({
        inviterId: 'inviter-1',
        email: 'friend@example.com',
        resourceType: 'ORGANIZATION',
        resourceId: 'org-1',
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitations.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({ eventType: 'PERMISSION_ESCALATION_ATTEMPT' }),
    );
  });

  it('authorizes an ORGANIZATION invite via OrgRoleResolver, not PermissionResolver', async () => {
    orgRoles.requireRole.mockResolvedValue('ADMIN');
    organizations.findById.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      ownerId: 'inviter-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Organization);
    users.findById.mockResolvedValue(makeUser());
    invitations.create.mockResolvedValue(
      makeInvitation({ resourceType: 'ORGANIZATION', resourceId: 'org-1' }),
    );

    await useCase.execute({
      inviterId: 'inviter-1',
      email: 'friend@example.com',
      resourceType: 'ORGANIZATION',
      resourceId: 'org-1',
      role: 'EDITOR',
    });

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'inviter-1',
      'org-1',
      'ADMIN',
    );
    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(emailAdapter.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ resourceName: 'Acme' }),
    );
  });
});
