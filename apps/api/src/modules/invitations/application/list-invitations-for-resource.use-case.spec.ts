import { ForbiddenException } from '@nestjs/common';
import { ListInvitationsForResourceUseCase } from './list-invitations-for-resource.use-case';
import type { Invitation } from '../domain/invitation.entity';
import type { InvitationRepository } from '../domain/invitation.repository';
import type { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';

describe('ListInvitationsForResourceUseCase', () => {
  let invitations: jest.Mocked<InvitationRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: ListInvitationsForResourceUseCase;

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
    useCase = new ListInvitationsForResourceUseCase(
      invitations,
      resolver,
      orgRoles,
    );
  });

  it('requires ADMIN+ before listing invitations', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'FILE', 'file-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitations.listForResource).not.toHaveBeenCalled();
  });

  it('returns every invitation on the resource once authorized', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    const rows: Invitation[] = [
      {
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
      },
    ];
    invitations.listForResource.mockResolvedValue(rows);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(invitations.listForResource).toHaveBeenCalledWith('FILE', 'file-1');
    expect(result).toBe(rows);
  });

  it('authorizes an ORGANIZATION resourceType via OrgRoleResolver', async () => {
    orgRoles.requireRole.mockResolvedValue('ADMIN');
    invitations.listForResource.mockResolvedValue([]);

    await useCase.execute('actor-1', 'ORGANIZATION', 'org-1');

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'org-1',
      'ADMIN',
    );
    expect(resolver.requireRole).not.toHaveBeenCalled();
  });
});
