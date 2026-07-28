import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

@Injectable()
export class GetFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  /** `ownerId` is unused now that PermissionGuard authorizes the request before this runs —
   * kept in the signature only so the controller doesn't need a separate no-owner call shape.
   * The actual existence lookup is unscoped: the caller may be a collaborator, not the owner. */
  async execute(id: string, _ownerId: string): Promise<Folder> {
    const folder = await this.folders.findByIdUnscoped(id);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }
}
