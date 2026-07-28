import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeInvitationUseCase } from './revoke-invitation.use-case';
import type { Invitation } from '../domain/invitation.entity';
import type { InvitationRepository } from '../domain/invitation.repository';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invite-1',
    email: 'friend@example.com',
    resourceType: 'FILE',
    resourceId: 'file-1',
    role: 'EDITOR',
    token: 'tok_abc',
    invitedBy: 'owner-1',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 86400_000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RevokeInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: RevokeInvitationUseCase;

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      updateStatus: jest.fn(),
      listForResource: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new RevokeInvitationUseCase(invitations, resolver, orgRoles);
  });

  it("throws NotFoundException when the invitation doesn't exist", async () => {
    invitations.findById.mockResolvedValue(null);
    await expect(useCase.execute('actor-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires ADMIN+ on the underlying resource', async () => {
    invitations.findById.mockResolvedValue(makeInvitation());
    resolver.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(useCase.execute('actor-1', 'invite-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(invitations.updateStatus).not.toHaveBeenCalled();
  });

  it('marks the invitation REVOKED once authorized', async () => {
    invitations.findById.mockResolvedValue(makeInvitation());
    resolver.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('actor-1', 'invite-1');

    expect(invitations.updateStatus).toHaveBeenCalledWith(
      'invite-1',
      'REVOKED',
    );
  });

  it('authorizes an ORGANIZATION invite via OrgRoleResolver', async () => {
    invitations.findById.mockResolvedValue(
      makeInvitation({ resourceType: 'ORGANIZATION', resourceId: 'org-1' }),
    );
    orgRoles.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('actor-1', 'invite-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'ADMIN',
    );
    expect(resolver.requireRole).not.toHaveBeenCalled();
    expect(invitations.updateStatus).toHaveBeenCalledWith(
      'invite-1',
      'REVOKED',
    );
  });
});
