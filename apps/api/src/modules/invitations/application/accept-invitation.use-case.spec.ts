import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AcceptInvitationUseCase } from './accept-invitation.use-case';
import type { Invitation } from '../domain/invitation.entity';
import type { InvitationRepository } from '../domain/invitation.repository';
import type { Permission } from '../../sharing/domain/permission.entity';
import type { PermissionRepository } from '../../sharing/domain/permission.repository';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';
import type { OrganizationMemberRepository } from '../../organizations/domain/organization-member.repository';

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
    id: 'friend-1',
    clerkId: 'clerk-friend',
    email: 'friend@example.com',
    name: 'Friend',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-1',
    subjectId: 'friend-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    role: 'EDITOR',
    grantedBy: 'inviter-1',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AcceptInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationRepository>;
  let permissions: jest.Mocked<PermissionRepository>;
  let organizationMembers: jest.Mocked<OrganizationMemberRepository>;
  let users: jest.Mocked<UserRepository>;
  let events: { emit: jest.Mock };
  let useCase: AcceptInvitationUseCase;

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      updateStatus: jest.fn(),
      listForResource: jest.fn(),
    };
    permissions = {
      findExplicit: jest.fn(),
      findManyForSubject: jest.fn(),
      upsert: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      listForResource: jest.fn(),
      listGrantedToSubject: jest.fn(),
    };
    organizationMembers = {
      upsert: jest.fn(),
      findByOrgAndUser: jest.fn(),
      listForOrganization: jest.fn(),
      listForUser: jest.fn(),
      remove: jest.fn(),
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
    events = { emit: jest.fn() };
    useCase = new AcceptInvitationUseCase(
      invitations,
      permissions,
      organizationMembers,
      users,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it("throws NotFoundException when the token doesn't exist", async () => {
    invitations.findByToken.mockResolvedValue(null);
    await expect(useCase.execute('friend-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an already-accepted invitation', async () => {
    invitations.findByToken.mockResolvedValue(
      makeInvitation({ status: 'ACCEPTED' }),
    );
    await expect(useCase.execute('friend-1', 'tok_abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(permissions.upsert).not.toHaveBeenCalled();
  });

  it('rejects a revoked invitation', async () => {
    invitations.findByToken.mockResolvedValue(
      makeInvitation({ status: 'REVOKED' }),
    );
    await expect(useCase.execute('friend-1', 'tok_abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks an expired invitation EXPIRED and rejects the accept', async () => {
    invitations.findByToken.mockResolvedValue(
      makeInvitation({ expiresAt: new Date('2020-01-01') }),
    );

    await expect(useCase.execute('friend-1', 'tok_abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(invitations.updateStatus).toHaveBeenCalledWith(
      'invite-1',
      'EXPIRED',
    );
    expect(permissions.upsert).not.toHaveBeenCalled();
  });

  it("404s when the authenticated actor doesn't exist", async () => {
    invitations.findByToken.mockResolvedValue(makeInvitation());
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('friend-1', 'tok_abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects when the authenticated actor's email doesn't match the invitation", async () => {
    invitations.findByToken.mockResolvedValue(makeInvitation());
    users.findById.mockResolvedValue(
      makeUser({ email: 'someone-else@example.com' }),
    );
    await expect(useCase.execute('friend-1', 'tok_abc')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(permissions.upsert).not.toHaveBeenCalled();
  });

  it('matches email case-insensitively', async () => {
    invitations.findByToken.mockResolvedValue(
      makeInvitation({ email: 'Friend@Example.com' }),
    );
    users.findById.mockResolvedValue(makeUser({ email: 'friend@example.com' }));
    permissions.upsert.mockResolvedValue(makePermission());

    await expect(useCase.execute('friend-1', 'tok_abc')).resolves.toBeDefined();
  });

  it('grants the invited role and marks the invitation ACCEPTED on success', async () => {
    invitations.findByToken.mockResolvedValue(makeInvitation());
    users.findById.mockResolvedValue(makeUser());
    permissions.upsert.mockResolvedValue(makePermission());

    const result = await useCase.execute('friend-1', 'tok_abc');

    expect(permissions.upsert).toHaveBeenCalledWith({
      subjectId: 'friend-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      role: 'EDITOR',
      grantedBy: 'inviter-1',
    });
    expect(invitations.updateStatus).toHaveBeenCalledWith(
      'invite-1',
      'ACCEPTED',
    );
    expect(result.role).toBe('EDITOR');
  });

  it('upserts an OrganizationMember (not a Permission) for an ORGANIZATION invite', async () => {
    invitations.findByToken.mockResolvedValue(
      makeInvitation({
        resourceType: 'ORGANIZATION',
        resourceId: 'org-1',
        role: 'EDITOR',
      }),
    );
    users.findById.mockResolvedValue(makeUser());
    organizationMembers.upsert.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      userId: 'friend-1',
      role: 'EDITOR',
      createdAt: new Date(),
    });

    const result = await useCase.execute('friend-1', 'tok_abc');

    expect(organizationMembers.upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'friend-1',
      role: 'EDITOR',
    });
    expect(permissions.upsert).not.toHaveBeenCalled();
    expect(result.resourceType).toBe('ORGANIZATION');
    expect(result.resourceId).toBe('org-1');
    expect(result.role).toBe('EDITOR');
  });
});
