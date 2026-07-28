import { ForbiddenException } from '@nestjs/common';
import { PermissionResolver } from './permission-resolver.service';
import type { Permission } from './permission.entity';
import type { PermissionRepository } from './permission.repository';
import type { Folder } from '../../folders/domain/folder.entity';
import type { FolderRepository } from '../../folders/domain/folder.repository';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Documents',
    ownerId: 'owner-1',
    parentId: 'root',
    path: '/root/',
    depth: 1,
    organizationId: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(overrides: Partial<File> = {}): File {
  return {
    id: 'file-1',
    name: 'report.pdf',
    ownerId: 'owner-1',
    folderId: 'folder-1',
    storageObjectId: 'storage-1',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-1/abc',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-1',
    subjectId: 'actor-1',
    resourceType: 'FOLDER',
    resourceId: 'folder-1',
    role: 'VIEWER',
    grantedBy: 'owner-1',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PermissionResolver', () => {
  let folders: jest.Mocked<FolderRepository>;
  let files: jest.Mocked<FileRepository>;
  let permissions: jest.Mocked<PermissionRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let resolver: PermissionResolver;

  beforeEach(() => {
    folders = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findRoot: jest.fn(),
      createRoot: jest.fn(),
      createWorkspaceRoot: jest.fn(),
      findWorkspaceRoot: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      findChildren: jest.fn(),
      findDescendantIds: jest.fn(),
      move: jest.fn(),
      softDeleteSubtree: jest.fn(),
      isTrashed: jest.fn(),
      restoreSubtree: jest.fn(),
      deleteRow: jest.fn(),
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
    permissions = {
      findExplicit: jest.fn(),
      findManyForSubject: jest.fn(),
      upsert: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      listForResource: jest.fn(),
      listGrantedToSubject: jest.fn(),
    };
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    resolver = new PermissionResolver(folders, files, permissions, orgRoles);
  });

  describe('resolveRole — folders', () => {
    it('returns null when the folder does not exist', async () => {
      folders.findByIdUnscoped.mockResolvedValue(null);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'missing');
      expect(role).toBeNull();
    });

    it('returns OWNER for the resource owner without querying Permission at all', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ ownerId: 'actor-1' }),
      );
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');
      expect(role).toBe('OWNER');
      expect(permissions.findManyForSubject).not.toHaveBeenCalled();
    });

    it('returns null when there is no grant anywhere in the chain', async () => {
      folders.findByIdUnscoped.mockResolvedValue(makeFolder());
      permissions.findManyForSubject.mockResolvedValue([]);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');
      expect(role).toBeNull();
    });

    it('returns the role from an explicit grant directly on the folder', async () => {
      folders.findByIdUnscoped.mockResolvedValue(makeFolder());
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'folder-1', role: 'EDITOR' }),
      ]);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');
      expect(role).toBe('EDITOR');
    });

    it('inherits a grant from a parent folder when the folder itself has no explicit grant', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'child', path: '/root/parent/' }),
      );
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'parent', role: 'VIEWER' }),
      ]);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'child');
      expect(role).toBe('VIEWER');
      expect(permissions.findManyForSubject).toHaveBeenCalledWith(
        'actor-1',
        'FOLDER',
        ['child', 'parent', 'root'],
      );
    });

    it('inherits from a grandparent when neither the folder nor its parent has a grant', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'grandchild', path: '/root/parent/child/' }),
      );
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'root', role: 'VIEWER' }),
      ]);
      const role = await resolver.resolveRole(
        'actor-1',
        'FOLDER',
        'grandchild',
      );
      expect(role).toBe('VIEWER');
    });

    it('lets a nearer explicit grant override a farther one, even to a lower role', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'child', path: '/root/parent/' }),
      );
      // parent grants ADMIN, but child has its own explicit VIEWER override — override wins,
      // not "most permissive of the chain wins".
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'parent', role: 'ADMIN' }),
        makePermission({ resourceId: 'child', role: 'VIEWER' }),
      ]);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'child');
      expect(role).toBe('VIEWER');
    });

    it('lets a nearer explicit grant override to a higher role too', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'child', path: '/root/parent/' }),
      );
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'parent', role: 'VIEWER' }),
        makePermission({ resourceId: 'child', role: 'ADMIN' }),
      ]);
      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'child');
      expect(role).toBe('ADMIN');
    });
  });

  describe('resolveRole — org-role fallback', () => {
    it('falls back to the org role when a workspace-scoped folder has no owner/explicit/chain grant', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ organizationId: 'org-1', workspaceId: 'ws-1' }),
      );
      permissions.findManyForSubject.mockResolvedValue([]);
      orgRoles.resolveRole.mockResolvedValue('EDITOR');

      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');

      expect(role).toBe('EDITOR');
      expect(orgRoles.resolveRole).toHaveBeenCalledWith('actor-1', 'org-1');
    });

    it('never consults org role for a personal (non-workspace) folder', async () => {
      folders.findByIdUnscoped.mockResolvedValue(makeFolder());
      permissions.findManyForSubject.mockResolvedValue([]);

      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');

      expect(role).toBeNull();
      expect(orgRoles.resolveRole).not.toHaveBeenCalled();
    });

    it('a closer explicit grant still wins over the org role', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ organizationId: 'org-1', workspaceId: 'ws-1' }),
      );
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'folder-1', role: 'VIEWER' }),
      ]);

      const role = await resolver.resolveRole('actor-1', 'FOLDER', 'folder-1');

      expect(role).toBe('VIEWER');
      expect(orgRoles.resolveRole).not.toHaveBeenCalled();
    });

    it('falls back to the org role for a file via its containing folder', async () => {
      files.findByIdUnscoped.mockResolvedValue(makeFile());
      permissions.findExplicit.mockResolvedValue(null);
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ organizationId: 'org-1', workspaceId: 'ws-1' }),
      );
      permissions.findManyForSubject.mockResolvedValue([]);
      orgRoles.resolveRole.mockResolvedValue('VIEWER');

      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');

      expect(role).toBe('VIEWER');
      expect(orgRoles.resolveRole).toHaveBeenCalledWith('actor-1', 'org-1');
    });
  });

  describe('resolveRole — files', () => {
    it('returns null when the file does not exist', async () => {
      files.findByIdUnscoped.mockResolvedValue(null);
      const role = await resolver.resolveRole('actor-1', 'FILE', 'missing');
      expect(role).toBeNull();
    });

    it('returns OWNER for the file owner', async () => {
      files.findByIdUnscoped.mockResolvedValue(
        makeFile({ ownerId: 'actor-1' }),
      );
      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');
      expect(role).toBe('OWNER');
    });

    it('returns the role from an explicit grant directly on the file, without checking the folder', async () => {
      files.findByIdUnscoped.mockResolvedValue(makeFile());
      permissions.findExplicit.mockResolvedValue(
        makePermission({
          resourceType: 'FILE',
          resourceId: 'file-1',
          role: 'EDITOR',
        }),
      );
      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');
      expect(role).toBe('EDITOR');
      expect(folders.findByIdUnscoped).not.toHaveBeenCalled();
      expect(permissions.findExplicit).toHaveBeenCalledWith(
        'actor-1',
        'FILE',
        'file-1',
      );
    });

    it('falls back to the containing folder chain when the file has no explicit grant', async () => {
      files.findByIdUnscoped.mockResolvedValue(
        makeFile({ folderId: 'folder-1' }),
      );
      permissions.findExplicit.mockResolvedValue(null);
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'folder-1' }),
      );
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'folder-1', role: 'VIEWER' }),
      ]);
      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');
      expect(role).toBe('VIEWER');
    });

    it('returns null if the file has no grant and its folder no longer exists', async () => {
      files.findByIdUnscoped.mockResolvedValue(makeFile());
      permissions.findExplicit.mockResolvedValue(null);
      folders.findByIdUnscoped.mockResolvedValue(null);
      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');
      expect(role).toBeNull();
    });

    it('returns null (never consulting org role) for a personal file with no chain grant, whose containing folder has no organizationId', async () => {
      files.findByIdUnscoped.mockResolvedValue(
        makeFile({ folderId: 'folder-1' }),
      );
      permissions.findExplicit.mockResolvedValue(null);
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ id: 'folder-1', organizationId: null }),
      );
      permissions.findManyForSubject.mockResolvedValue([]);

      const role = await resolver.resolveRole('actor-1', 'FILE', 'file-1');

      expect(role).toBeNull();
      expect(orgRoles.resolveRole).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('resolves and returns the role when it meets the minimum', async () => {
      folders.findByIdUnscoped.mockResolvedValue(
        makeFolder({ ownerId: 'actor-1' }),
      );
      const role = await resolver.requireRole(
        'actor-1',
        'FOLDER',
        'folder-1',
        'VIEWER',
      );
      expect(role).toBe('OWNER');
    });

    it('throws ForbiddenException when there is no access at all', async () => {
      folders.findByIdUnscoped.mockResolvedValue(makeFolder());
      permissions.findManyForSubject.mockResolvedValue([]);
      await expect(
        resolver.requireRole('actor-1', 'FOLDER', 'folder-1', 'VIEWER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when the resolved role is below the minimum', async () => {
      folders.findByIdUnscoped.mockResolvedValue(makeFolder());
      permissions.findManyForSubject.mockResolvedValue([
        makePermission({ resourceId: 'folder-1', role: 'VIEWER' }),
      ]);
      await expect(
        resolver.requireRole('actor-1', 'FOLDER', 'folder-1', 'EDITOR'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("doesn't leak whether a resource exists — missing resource and insufficient role both reject the same way", async () => {
      folders.findByIdUnscoped.mockResolvedValue(null);
      await expect(
        resolver.requireRole('actor-1', 'FOLDER', 'missing', 'VIEWER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
