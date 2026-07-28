import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TRASH_REPOSITORY,
  type TrashRepository,
} from '../domain/trash.repository';
import { PermanentDeleteFileUseCase } from './permanent-delete-file.use-case';
import { PermanentDeleteFolderUseCase } from './permanent-delete-folder.use-case';

/** Resolves a Trash row id to its file/folder and dispatches to the matching permanent-delete
 * flow — the single entry point behind `DELETE /trash/:id/permanent`. */
@Injectable()
export class PermanentDeleteUseCase {
  constructor(
    @Inject(TRASH_REPOSITORY) private readonly trash: TrashRepository,
    private readonly permanentDeleteFile: PermanentDeleteFileUseCase,
    private readonly permanentDeleteFolder: PermanentDeleteFolderUseCase,
  ) {}

  async execute(trashId: string, ownerId: string): Promise<void> {
    const entry = await this.trash.findById(trashId, ownerId);
    if (!entry) {
      throw new NotFoundException('Trash entry not found');
    }

    if (entry.type === 'file') {
      await this.permanentDeleteFile.execute(entry.id, ownerId);
    } else {
      await this.permanentDeleteFolder.execute(entry.id, ownerId);
    }
  }
}
