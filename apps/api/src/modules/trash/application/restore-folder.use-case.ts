import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { buildChildPath } from '../../folders/domain/folder.entity';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';

/** Restores a trashed folder and its entire subtree together (mirroring how recursive delete
 * trashed them together). If the folder's original parent is itself trashed, relocates it to the
 * user's root first, same fallback reasoning as RestoreFileUseCase. */
@Injectable()
export class RestoreFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(id: string, ownerId: string): Promise<Folder> {
    const folder = await this.folders.findById(id, ownerId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    let relocatedToRoot = false;
    if (folder.parentId) {
      const parentTrashed = await this.folders.isTrashed(folder.parentId);
      if (parentTrashed) {
        const root = await this.folders.findRoot(ownerId);
        if (!root) {
          throw new NotFoundException('Root folder not found');
        }
        await this.folders.move({
          id,
          ownerId,
          newParentId: root.id,
          newPath: buildChildPath(root),
          newDepth: root.depth + 1,
        });
        relocatedToRoot = true;
      }
    }

    const restoredFolderIds = await this.folders.restoreSubtree(id, ownerId);
    await this.files.restoreByFolderIds(restoredFolderIds, ownerId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'RESTORE', 'FOLDER', id, {
        name: folder.name,
        relocatedToRoot,
        restoredFolderCount: restoredFolderIds.length,
      }),
    );

    const restored = await this.folders.findById(id, ownerId);
    if (!restored) {
      throw new NotFoundException('Folder not found');
    }
    return restored;
  }
}
