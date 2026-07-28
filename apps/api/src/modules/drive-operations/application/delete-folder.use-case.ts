import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';

export interface DeleteFolderResult {
  trashedFolders: number;
  trashedFiles: number;
}

@Injectable()
export class DeleteFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has EDITOR+ on the folder,
   * which may belong to someone else. The entire subtree (regardless of individual descendant
   * ownership — see PrismaFileRepository.softDeleteByFolderIds) is filed into Trash under the
   * folder's own actual owner (`folder.ownerId`), not the deleting actor, so it shows up in the
   * real owner's Trash — the ActivityEvent still attributes the action to `actorId`. */
  async execute(id: string, actorId: string): Promise<DeleteFolderResult> {
    const folder = await this.folders.findByIdUnscoped(id);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.parentId === null) {
      throw new BadRequestException('The root folder cannot be deleted');
    }

    // Both steps are already single batched writes internally (one createMany each), so a
    // subtree of 1000+ descendants costs two round trips total, not one per item.
    const trashedFolderIds = await this.folders.softDeleteSubtree(
      id,
      folder.ownerId,
    );
    const trashedFiles = await this.files.softDeleteByFolderIds(
      trashedFolderIds,
      folder.ownerId,
    );

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'DELETE', 'FOLDER', id, {
        name: folder.name,
        permanent: false,
        trashedFolders: trashedFolderIds.length,
        trashedFiles,
      }),
    );

    return { trashedFolders: trashedFolderIds.length, trashedFiles };
  }
}
