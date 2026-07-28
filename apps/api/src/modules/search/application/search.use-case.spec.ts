import { ForbiddenException } from '@nestjs/common';
import { SearchUseCase } from './search.use-case';
import type { SearchService } from '../domain/search.service';
import type { WorkspaceRepository } from '../../organizations/domain/workspace.repository';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import type { Workspace } from '../../organizations/domain/workspace.entity';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    organizationId: 'org-1',
    name: 'Eng',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SearchUseCase', () => {
  let search: jest.Mocked<SearchService>;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let useCase: SearchUseCase;

  beforeEach(() => {
    search = {
      search: jest.fn(),
      listRecent: jest.fn(),
      listFavorites: jest.fn(),
    };
    workspaces = {
      create: jest.fn(),
      findById: jest.fn(),
      listForOrganization: jest.fn(),
      rename: jest.fn(),
      delete: jest.fn(),
    };
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    useCase = new SearchUseCase(search, workspaces, orgRoles);
  });

  it('runs the search directly when no workspaceId is given (personal search)', async () => {
    search.search.mockResolvedValue({ items: [], nextCursor: null });
    await useCase.execute({ ownerId: 'user-1', q: 'invoice', limit: 20 });
    expect(workspaces.findById).not.toHaveBeenCalled();
    expect(search.search).toHaveBeenCalledWith({
      ownerId: 'user-1',
      q: 'invoice',
      limit: 20,
    });
  });

  it('rejects with ForbiddenException for a nonexistent workspaceId (anti-enumeration)', async () => {
    workspaces.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        ownerId: 'user-1',
        q: 'x',
        workspaceId: 'missing',
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(search.search).not.toHaveBeenCalled();
  });

  it('rejects the same way for a real but inaccessible workspace (never distinguishable from missing)', async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute({
        ownerId: 'user-1',
        q: 'x',
        workspaceId: 'ws-1',
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(search.search).not.toHaveBeenCalled();
  });

  it('searches the workspace once VIEWER+ role is confirmed', async () => {
    workspaces.findById.mockResolvedValue(makeWorkspace());
    orgRoles.requireRole.mockResolvedValue('VIEWER');
    search.search.mockResolvedValue({ items: [], nextCursor: null });

    await useCase.execute({
      ownerId: 'user-1',
      q: 'x',
      workspaceId: 'ws-1',
      limit: 20,
    });

    expect(orgRoles.requireRole).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'VIEWER',
    );
    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1' }),
    );
  });
});
