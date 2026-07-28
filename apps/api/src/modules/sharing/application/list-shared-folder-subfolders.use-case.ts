import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import { SharedFolderAccessResolver } from '../domain/shared-folder-access-resolver.service';

export interface ListSharedFolderSubfoldersParams {
  token: string;
  password?: string;
  folderId?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListSharedFolderSubfoldersUseCase {
  constructor(
    private readonly access: SharedFolderAccessResolver,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async execute(
    params: ListSharedFolderSubfoldersParams,
  ): Promise<CursorPage<Folder>> {
    const { targetFolder } = await this.access.resolve(
      params.token,
      params.password,
      params.folderId,
    );

    const rows = await this.folders.findChildren({
      ownerId: targetFolder.ownerId,
      parentId: targetFolder.id,
      cursor: params.cursor,
      limit: params.limit,
    });
    return buildCursorPage(rows, params.limit);
  }
}
