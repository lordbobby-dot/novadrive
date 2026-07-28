import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { parseAncestorIds, type Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

@Injectable()
export class GetBreadcrumbUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  /** `ownerId` is unused now that PermissionGuard authorizes the request before this runs. */
  async execute(folderId: string, _ownerId: string): Promise<Folder[]> {
    const folder = await this.folders.findByIdUnscoped(folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const ancestorIds = parseAncestorIds(folder.path);
    if (ancestorIds.length === 0) {
      return [folder];
    }

    // Ancestors always belong to the same owner as the folder itself.
    const ancestors = await this.folders.findByIds(ancestorIds, folder.ownerId);
    const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    const ordered = ancestorIds
      .map((id) => byId.get(id))
      .filter((ancestor): ancestor is Folder => ancestor !== undefined);

    return [...ordered, folder];
  }
}
