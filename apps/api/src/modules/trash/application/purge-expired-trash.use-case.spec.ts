import type { ConfigService } from '@nestjs/config';
import { PurgeExpiredTrashUseCase } from './purge-expired-trash.use-case';
import type { PermanentDeleteFileUseCase } from './permanent-delete-file.use-case';
import type { PermanentDeleteFolderUseCase } from './permanent-delete-folder.use-case';
import type { TrashRepository } from '../domain/trash.repository';
import type { EnvConfig } from '../../../config/env.validation';

describe('PurgeExpiredTrashUseCase', () => {
  let trash: jest.Mocked<TrashRepository>;
  let permanentDeleteFile: jest.Mocked<PermanentDeleteFileUseCase>;
  let permanentDeleteFolder: jest.Mocked<PermanentDeleteFolderUseCase>;
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let useCase: PurgeExpiredTrashUseCase;

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
    config = { get: jest.fn().mockReturnValue(30) } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    useCase = new PurgeExpiredTrashUseCase(
      trash,
      permanentDeleteFile,
      permanentDeleteFolder,
      config,
    );
  });

  it('does nothing when nothing has expired', async () => {
    trash.findExpiredRoots.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual({ purged: 0, failed: 0 });
    expect(permanentDeleteFile.execute).not.toHaveBeenCalled();
    expect(permanentDeleteFolder.execute).not.toHaveBeenCalled();
  });

  it('dispatches each expired item to the matching permanent-delete use case', async () => {
    trash.findExpiredRoots.mockResolvedValue([
      { type: 'file', id: 'file-1', ownerId: 'owner-1' },
      { type: 'folder', id: 'folder-1', ownerId: 'owner-2' },
    ]);

    const result = await useCase.execute();

    expect(permanentDeleteFile.execute).toHaveBeenCalledWith(
      'file-1',
      'owner-1',
    );
    expect(permanentDeleteFolder.execute).toHaveBeenCalledWith(
      'folder-1',
      'owner-2',
    );
    expect(result).toEqual({ purged: 2, failed: 0 });
  });

  it('counts a failure and keeps processing the rest of the sweep', async () => {
    trash.findExpiredRoots.mockResolvedValue([
      { type: 'file', id: 'file-1', ownerId: 'owner-1' },
      { type: 'file', id: 'file-2', ownerId: 'owner-1' },
    ]);
    permanentDeleteFile.execute
      .mockRejectedValueOnce(new Error('S3 unreachable'))
      .mockResolvedValueOnce(undefined);

    const result = await useCase.execute();

    expect(result).toEqual({ purged: 1, failed: 1 });
    expect(permanentDeleteFile.execute).toHaveBeenCalledTimes(2);
  });
});
