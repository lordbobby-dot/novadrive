import { ForbiddenException } from '@nestjs/common';
import { CreateSharedLinkUseCase } from './create-shared-link.use-case';
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

describe('CreateSharedLinkUseCase', () => {
  let links: jest.Mocked<SharedLinkRepository>;
  let resolver: jest.Mocked<PermissionResolver>;
  let events: { emit: jest.Mock };
  let useCase: CreateSharedLinkUseCase;

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
    events = { emit: jest.fn() };
    useCase = new CreateSharedLinkUseCase(
      links,
      resolver,
      events as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );
  });

  it('requires ADMIN+ on the resource before creating a link', async () => {
    resolver.requireRole.mockRejectedValue(new ForbiddenException());

    await expect(
      useCase.execute({
        ownerId: 'actor-1',
        resourceType: 'FILE',
        resourceId: 'file-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolver.requireRole).toHaveBeenCalledWith(
      'actor-1',
      'FILE',
      'file-1',
      'ADMIN',
    );
    expect(links.create).not.toHaveBeenCalled();
  });

  it('defaults to view+download, no comment/edit, PRIVATE visibility', async () => {
    resolver.requireRole.mockResolvedValue('ADMIN');
    links.create.mockResolvedValue(makeLink());

    await useCase.execute({
      ownerId: 'actor-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
    });

    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canView: true,
        canDownload: true,
        canComment: false,
        canEdit: false,
        visibility: 'PRIVATE',
        passwordHash: undefined,
      }),
    );
  });

  it('hashes a provided password rather than storing it in plaintext', async () => {
    resolver.requireRole.mockResolvedValue('OWNER');
    links.create.mockResolvedValue(makeLink());

    await useCase.execute({
      ownerId: 'actor-1',
      resourceType: 'FILE',
      resourceId: 'file-1',
      password: 'hunter2',
    });

    const call = links.create.mock.calls[0][0];
    expect(call.passwordHash).toBeDefined();
    expect(call.passwordHash).not.toBe('hunter2');
  });

  it('emits a SHARE activity event scoped to the resource', async () => {
    resolver.requireRole.mockResolvedValue('OWNER');
    links.create.mockResolvedValue(makeLink({ id: 'link-42' }));

    await useCase.execute({
      ownerId: 'actor-1',
      resourceType: 'FOLDER',
      resourceId: 'folder-9',
    });

    expect(events.emit).toHaveBeenCalledWith(
      'activity',
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'SHARE',
        targetType: 'FOLDER',
        targetId: 'folder-9',
        metadata: { linkId: 'link-42' },
      }),
    );
  });
});
