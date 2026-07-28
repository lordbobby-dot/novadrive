import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';

@Injectable()
export class DeleteFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has EDITOR+ on the file,
   * which may belong to someone else. The Trash row is filed under the file's own actual owner
   * (`file.ownerId`), not the deleting actor, so it shows up in the real owner's Trash rather
   * than vanishing into the collaborator's — the ActivityEvent still attributes the action to
   * `actorId` for the audit trail. */
  async execute(id: string, actorId: string): Promise<void> {
    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    await this.files.softDelete(id, file.ownerId);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'DELETE', 'FILE', id, {
        name: file.name,
        permanent: false,
      }),
    );
  }
}
