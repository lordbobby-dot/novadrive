import { ListSharedWithMeUseCase } from './list-shared-with-me.use-case';
import type { PermissionRepository } from '../domain/permission.repository';
import type { SharedWithMeRow } from '../domain/shared-with-me.entity';
import type { User } from '../../users/domain/user.entity';
import type { UserRepository } from '../../users/domain/user.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-1',
    clerkId: 'clerk-owner-1',
    email: 'owner@example.com',
    name: 'Owner',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRow(overrides: Partial<SharedWithMeRow> = {}): SharedWithMeRow {
  return {
    type: 'file',
    id: 'file-1',
    name: 'report.pdf',
    parentOrFolderId: 'folder-1',
    contentType: 'application/pdf',
    size: '1024',
    role: 'EDITOR',
    ownerId: 'owner-1',
    grantedAt: new Date(),
    ...overrides,
  };
}

describe('ListSharedWithMeUseCase', () => {
  let permissions: jest.Mocked<PermissionRepository>;
  let users: jest.Mocked<UserRepository>;
  let useCase: ListSharedWithMeUseCase;

  beforeEach(() => {
    permissions = {
      findExplicit: jest.fn(),
      findManyForSubject: jest.fn(),
      upsert: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      listForResource: jest.fn(),
      listGrantedToSubject: jest.fn(),
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
    useCase = new ListSharedWithMeUseCase(permissions, users);
  });

  it("resolves each row's ownerId to a display name, falling back to email", async () => {
    const rows = [
      makeRow({ id: 'file-1', ownerId: 'owner-1' }),
      makeRow({
        id: 'folder-1',
        type: 'folder',
        ownerId: 'owner-2',
        contentType: null,
        size: null,
      }),
    ];
    permissions.listGrantedToSubject.mockResolvedValue({
      rows,
      nextCursor: null,
    });
    users.findByIds.mockResolvedValue([
      makeUser({ id: 'owner-1', name: 'Alice', email: 'alice@example.com' }),
      makeUser({ id: 'owner-2', name: null, email: 'bob@example.com' }),
    ]);

    const page = await useCase.execute('me', undefined, 20);

    expect(permissions.listGrantedToSubject).toHaveBeenCalledWith(
      'me',
      undefined,
      20,
    );
    expect(users.findByIds).toHaveBeenCalledWith(['owner-1', 'owner-2']);
    expect(page.items).toEqual([
      { ...rows[0], ownerName: 'Alice' },
      { ...rows[1], ownerName: 'bob@example.com' },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('deduplicates owner ids before resolving names', async () => {
    permissions.listGrantedToSubject.mockResolvedValue({
      rows: [
        makeRow({ id: 'file-1', ownerId: 'owner-1' }),
        makeRow({ id: 'file-2', ownerId: 'owner-1' }),
      ],
      nextCursor: '20',
    });
    users.findByIds.mockResolvedValue([makeUser({ id: 'owner-1' })]);

    const page = await useCase.execute('me', undefined, 20);

    expect(users.findByIds).toHaveBeenCalledWith(['owner-1']);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('20');
  });

  it('falls back to null when the owner cannot be resolved', async () => {
    permissions.listGrantedToSubject.mockResolvedValue({
      rows: [makeRow({ ownerId: 'ghost' })],
      nextCursor: null,
    });
    users.findByIds.mockResolvedValue([]);

    const page = await useCase.execute('me', undefined, 20);

    expect(page.items[0]?.ownerName).toBeNull();
  });
});
