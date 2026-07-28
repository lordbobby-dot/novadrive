import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeSharedLinkUseCase } from './revoke-shared-link.use-case';
import type { SharedLink } from '../domain/shared-link.entity';
import type { SharedLinkRepository } from '../domain/shared-link.repository';
import type { PermissionResolver } from '../domain/permission-resolver.service';

function makeLink(overrides: Partial<SharedLink> = {}): SharedLink {
  return {
    id: 'link-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    token: 'tok_abc',
    ownerId: 'owner-1',
    passwordHash: null,
    expiresAt: null,
    maxDownloads: null,
    downloadCount: 0,
    canView: true,
    canDownload: true,
    canComment: false,
    canEdit: false,
    visibility: 'PRIVATE',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RevokeSharedLinkUseCase', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: RevokeSharedLinkUseCase;

  beforeEach(() => {
    links = {
      create: jest.fn(),
      findById: jest.fn(),
      findByToken: jest.fn(),
      listForResource: jest.fn(),
      delete: jest.fn(),
      incrementDownloadCountIfUnderLimit: jest.fn(),
    };
    resolver = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<PermissionResolver>;
    useCase = new RevokeSharedLinkUseCase(links, resolver);
  });

  it("throws NotFoundException when the link doesn't exist", async () => {
    links.findById.mockResolvedValue(null);
    await expect(useCase.execute('actor-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(resolver.requireRole).not.toHaveBeenCalled();
  });

  it('requires ADMIN+ on the underlying resource', async () => {
    links.findById.mockResolvedValue(makeLink());
    resolver.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(useCase.execute('actor-1', 'link-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(resolver.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'FILE',
      'file-1',
      'ADMIN',
    );
    expect(links.delete).not.toHaveBeenCalled();
  });

  it('deletes the link once authorized', async () => {
    links.findById.mockResolvedValue(makeLink());
    resolver.requireRole.mockResolvedValue('ADMIN');

    await useCase.execute('actor-1', 'link-1');

    expect(links.delete).toHaveBeenCalledWith('link-1');
  });
});
