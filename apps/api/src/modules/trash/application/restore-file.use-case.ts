import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import type { File } from '../../files/domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';

/** Restores a single trashed file. If its original folder is itself trashed (or was deleted out
 * from under it by some other action), relocates the file to the user's root instead of
 * resurrecting it invisibly inside a folder that's on its way to being purged. */
@Injectable()
export class RestoreFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(id: string, ownerId: string): Promise<File> {
    const file = await this.files.findById(id, ownerId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const originalFolderTrashed = await this.folders.isTrashed(file.folderId);
    if (originalFolderTrashed) {
      const root = await this.folders.findRoot(ownerId);
      if (!root) {
        throw new NotFoundException('Root folder not found');
      }
      await this.files.move(id, ownerId, root.id);
    }

    await this.files.restore(id, ownerId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'RESTORE', 'FILE', id, {
        name: file.name,
        relocatedToRoot: originalFolderTrashed,
      }),
    );

    const restored = await this.files.findById(id, ownerId);
    if (!restored) {
      throw new NotFoundException('File not found');
    }
    return restored;
  }
}
