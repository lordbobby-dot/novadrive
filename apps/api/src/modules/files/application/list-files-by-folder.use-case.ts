import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import type { File } from '../domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../domain/file.repository';

export interface ListFilesByFolderParams {
  ownerId: string;
  folderId: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListFilesByFolderUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async execute(params: ListFilesByFolderParams): Promise<CursorPage<File>> {
    const folder = await this.folders.findByIdUnscoped(params.folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Files always belong to the same owner as their containing folder — query by the folder's
    // actual owner, not the (possibly-collaborator) caller.
    const rows = await this.files.findByFolder({
      ...params,
      ownerId: folder.ownerId,
    });
    return buildCursorPage(rows, params.limit);
  }
}
