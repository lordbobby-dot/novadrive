import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { File } from '../../files/domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import { SharedFolderAccessResolver } from '../domain/shared-folder-access-resolver.service';

export interface ListSharedFolderFilesParams {
  token: string;
  password?: string;
  folderId?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListSharedFolderFilesUseCase {
  constructor(
    private readonly access: SharedFolderAccessResolver,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
  ) {}

  async execute(
    params: ListSharedFolderFilesParams,
  ): Promise<CursorPage<File>> {
    const { targetFolder } = await this.access.resolve(
      params.token,
      params.password,
      params.folderId,
    );

    const rows = await this.files.findByFolder({
      ownerId: targetFolder.ownerId,
      folderId: targetFolder.id,
      cursor: params.cursor,
      limit: params.limit,
    });
    return buildCursorPage(rows, params.limit);
  }
}
