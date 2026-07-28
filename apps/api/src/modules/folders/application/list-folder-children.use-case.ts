import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

export interface ListFolderChildrenParams {
  /** Unused now that PermissionGuard authorizes the caller before this runs — kept so the
   * controller's call shape doesn't change. */
  ownerId: string;
  parentId: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListFolderChildrenUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async execute(params: ListFolderChildrenParams): Promise<CursorPage<Folder>> {
    const parent = await this.folders.findByIdUnscoped(params.parentId);
    if (!parent) {
      throw new NotFoundException('Folder not found');
    }

    // Children always belong to the same owner as their parent — query by the folder's actual
    // owner, not the (possibly-collaborator) caller, since findChildren's `ownerId` filter is
    // "whose folders are these", not "who's asking".
    const rows = await this.folders.findChildren({
      ...params,
      ownerId: parent.ownerId,
    });
    return buildCursorPage(rows, params.limit);
  }
}
