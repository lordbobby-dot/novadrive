import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import type { File } from '../domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../domain/file.repository';

@Injectable()
export class RenameFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** `actorId` authorizes via ActivityEvent's actor field; the lookup is unscoped since the
   * caller may be a collaborator, not the owner — PermissionGuard has already verified access. */
  async execute(id: string, actorId: string, name: string): Promise<File> {
    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    const renamed = await this.files.rename(id, actorId, name);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'RENAME', 'FILE', id, {
        oldName: file.name,
        newName: name,
      }),
    );

    return renamed;
  }
}
