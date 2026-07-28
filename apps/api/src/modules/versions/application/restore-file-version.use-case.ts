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
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../domain/file-version.repository';

/** Moves the File's current-content pointer back to an earlier version's StorageObject. Does not
 * delete or renumber any FileVersion row — the version that was current before the restore stays
 * exactly as it was, satisfying "restoring an old version makes it current without losing the
 * version that was replaced" without needing to duplicate any content. */
@Injectable()
export class RestoreFileVersionUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has EDITOR+ on the file,
   * which may belong to someone else. `updateCurrentStorageObject` ignores its ownerId param
   * (ownership already verified above), so passing `actorId` through is safe. */
  async execute(
    fileId: string,
    actorId: string,
    versionNumber: number,
  ): Promise<File> {
    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const version = await this.versions.findByFileAndNumber(
      fileId,
      versionNumber,
    );
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    const updated = await this.files.updateCurrentStorageObject(
      fileId,
      actorId,
      version.storageObjectId,
    );

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'VERSION_RESTORE', 'FILE', fileId, {
        name: file.name,
        restoredVersionNumber: versionNumber,
      }),
    );

    return updated;
  }
}
