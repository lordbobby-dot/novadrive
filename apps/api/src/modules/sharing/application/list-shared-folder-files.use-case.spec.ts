import { ListSharedFolderFilesUseCase } from './list-shared-folder-files.use-case';
import { SharedFolderAccessResolver } from '../domain/shared-folder-access-resolver.service';
import type { Folder } from '../../folders/domain/folder.entity';
import type { File } from '../../files/domain/file.entity';
import type { FileRepository } from '../../files/domain/file.repository';

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'target-1',
    name: 'Shared Docs',
    ownerId: 'owner-42',
    parentId: 'drive-root',
    path: '/drive-root/',
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
    ownerId: 'owner-42',
    folderId: 'target-1',
    storageObjectId: 'storage-1',
    contentType: 'application/pdf',
    size: '1024',
    bucket: 'novadrive-dev',
    objectKey: 'uploads/owner-42/abc',
    region: 'us-east-1',
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListSharedFolderFilesUseCase', () => {
  let access: jest.Mocked<SharedFolderAccessResolver>;
  let files: jest.Mocked<FileRepository>;
  let useCase: ListSharedFolderFilesUseCase;

  beforeEach(() => {
    access = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<SharedFolderAccessResolver>;
    files = {
      findByFolder: jest.fn(),
    } as unknown as jest.Mocked<FileRepository>;
    useCase = new ListSharedFolderFilesUseCase(access, files);
  });

  it("resolves link access first, then lists the target folder's files scoped by its actual owner", async () => {
    const target = makeFolder();
    access.resolve.mockResolvedValue({
      link: {} as never,
      rootFolder: target,
      targetFolder: target,
    });
    const file = makeFile();
    files.findByFolder.mockResolvedValue([file]);

    const result = await useCase.execute({
      token: 'tok_abc',
      password: 'secret',
      folderId: 'target-1',
      limit: 20,
    });

    expect(access.resolve).toHaveBeenCalledWith(
      'tok_abc',
      'secret',
      'target-1',
    );
    expect(files.findByFolder).toHaveBeenCalledWith({
      ownerId: 'owner-42',
      folderId: 'target-1',
      cursor: undefined,
      limit: 20,
    });
    expect(result.items).toEqual([file]);
  });
});
