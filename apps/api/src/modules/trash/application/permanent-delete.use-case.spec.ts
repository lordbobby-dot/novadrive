import { NotFoundException } from '@nestjs/common';
import { PermanentDeleteUseCase } from './permanent-delete.use-case';
import type { TrashRepository } from '../domain/trash.repository';
import type { PermanentDeleteFileUseCase } from './permanent-delete-file.use-case';
import type { PermanentDeleteFolderUseCase } from './permanent-delete-folder.use-case';

describe('PermanentDeleteUseCase', () => {
  let trash: jest.Mocked<TrashRepository>;
  let permanentDeleteFile: jest.Mocked<PermanentDeleteFileUseCase>;
  let permanentDeleteFolder: jest.Mocked<PermanentDeleteFolderUseCase>;
  let useCase: PermanentDeleteUseCase;

  beforeEach(() => {
    trash = {
      listRoots: jest.fn(),
      findById: jest.fn(),
      findExpiredRoots: jest.fn(),
      getStorageObjectLocations: jest.fn(),
      deleteStorageObjects: jest.fn(),
    };
    permanentDeleteFile = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PermanentDeleteFileUseCase>;
    permanentDeleteFolder = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PermanentDeleteFolderUseCase>;
    useCase = new PermanentDeleteUseCase(
      trash,
      permanentDeleteFile,
      permanentDeleteFolder,
    );
  });

  it("throws NotFoundException when the trash entry doesn't exist (or isn't owned by the caller)", async () => {
    trash.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing', 'owner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(permanentDeleteFile.execute).not.toHaveBeenCalled();
    expect(permanentDeleteFolder.execute).not.toHaveBeenCalled();
  });

  it('dispatches to PermanentDeleteFileUseCase for a file-type entry', async () => {
    trash.findById.mockResolvedValue({ type: 'file', id: 'file-1' });

    await useCase.execute('trash-1', 'owner-1');

    expect(permanentDeleteFile.execute).toHaveBeenCalledWith(
      'file-1',
      'owner-1',
    );
    expect(permanentDeleteFolder.execute).not.toHaveBeenCalled();
  });

  it('dispatches to PermanentDeleteFolderUseCase for a folder-type entry', async () => {
    trash.findById.mockResolvedValue({ type: 'folder', id: 'folder-1' });

    await useCase.execute('trash-1', 'owner-1');

    expect(permanentDeleteFolder.execute).toHaveBeenCalledWith(
      'folder-1',
      'owner-1',
    );
    expect(permanentDeleteFile.execute).not.toHaveBeenCalled();
  });
});
