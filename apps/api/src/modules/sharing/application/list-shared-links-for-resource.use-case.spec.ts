import { ForbiddenException } from '@nestjs/common';
import { ListSharedLinksForResourceUseCase } from './list-shared-links-for-resource.use-case';
import type { SharedLink } from '../domain/shared-link.entity';
import type { SharedLinkRepository } from '../domain/shared-link.repository';
import type { PermissionResolver } from '../domain/permission-resolver.service';

describe('ListSharedLinksForResourceUseCase', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let useCase: ListSharedLinksForResourceUseCase;

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
    useCase = new ListSharedLinksForResourceUseCase(links, resolver);
  });

  it('requires ADMIN+ before listing links', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'FILE', 'file-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(links.listForResource).not.toHaveBeenCalled();
  });

  it('returns every link on the resource once authorized', async () => {
    resolver.requireRole.mockResolvedValue('OWNER');
    const rows: SharedLink[] = [
      {
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
      },
    ];
    links.listForResource.mockResolvedValue(rows);

    const result = await useCase.execute('actor-1', 'FILE', 'file-1');

    expect(links.listForResource).toHaveBeenCalledWith('FILE', 'file-1');
    expect(result).toBe(rows);
  });
});
