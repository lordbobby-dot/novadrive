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
import type { Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

@Injectable()
export class RenameFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** `actorId` authorizes via ActivityEvent's actor field and is passed through to `rename()`
   * (which ignores it — ownership is already verified by PermissionGuard before this runs); the
   * lookup itself is unscoped since the caller may be a collaborator, not the owner. */
  async execute(id: string, actorId: string, name: string): Promise<Folder> {
    const folder = await this.folders.findByIdUnscoped(id);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.parentId === null) {
      throw new BadRequestException('The root folder cannot be renamed');
    }

    const renamed = await this.folders.rename(id, actorId, name);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'RENAME', 'FOLDER', id, {
        oldName: folder.name,
        newName: name,
      }),
    );

    return renamed;
  }
}
