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

@Injectable()
export class MoveFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookups — PermissionGuard has already verified `actorId` has EDITOR+ on both the
   * file and the target folder, which may belong to someone else. Moving a file never changes
   * its ownerId (see PrismaFolderRepository.move for why that's safe even so). */
  async execute(params: {
    id: string;
    actorId: string;
    targetFolderId: string;
  }): Promise<File> {
    const { id, actorId, targetFolderId } = params;

    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const targetFolder = await this.folders.findByIdUnscoped(targetFolderId);
    if (!targetFolder) {
      throw new NotFoundException('Target folder not found');
    }

    const moved = await this.files.move(id, actorId, targetFolderId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'MOVE', 'FILE', id, {
        name: file.name,
        fromFolderId: file.folderId,
        toFolderId: targetFolderId,
      }),
    );

    return moved;
  }
}
