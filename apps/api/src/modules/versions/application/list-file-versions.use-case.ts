import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import type { FileVersion } from '../domain/file-version.entity';
import {
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../domain/file-version.repository';

export interface FileVersionsPage {
  versions: FileVersion[];
  /** The version.storageObjectId that's currently active — the highest versionNumber isn't
   * necessarily current, since restoring an earlier version moves the pointer backward without
   * renumbering anything. Callers use this to mark exactly one row "current" regardless of
   * restore history. */
  currentStorageObjectId: string;
}

@Injectable()
export class ListFileVersionsUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has VIEWER+ on the file,
   * which may belong to someone else. */
  async execute(fileId: string, _actorId: string): Promise<FileVersionsPage> {
    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    const versions = await this.versions.listByFile(fileId);
    return { versions, currentStorageObjectId: file.storageObjectId };
  }
}
