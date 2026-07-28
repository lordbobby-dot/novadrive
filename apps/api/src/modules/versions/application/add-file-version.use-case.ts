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
import type { FileVersion } from '../domain/file-version.entity';
import {
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../domain/file-version.repository';

export interface AddFileVersionParams {
  fileId: string;
  ownerId: string;
  storageObjectId: string;
  changeNote?: string;
}

/** Attaches a just-completed upload's StorageObject to an existing File as a new version,
 * rewriting the File's current pointer to it. Called from the checksum-verification worker when
 * an upload was initiated as "a new version of file X" rather than "a new file" — see
 * docs/versioning-and-activity.md for how that distinction flows through the upload pipeline. */
@Injectable()
export class AddFileVersionUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookup — `params.ownerId` is the actor who completed the upload, who may be a
   * collaborator rather than the file's owner; the guard on `POST /uploads/:id/complete`
   * already verified EDITOR+ before the checksum job was queued. */
  async execute(params: AddFileVersionParams): Promise<FileVersion> {
    const { fileId, ownerId, storageObjectId, changeNote } = params;

    const file = await this.files.findByIdUnscoped(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const version = await this.versions.create({
      fileId,
      storageObjectId,
      createdBy: ownerId,
      changeNote,
    });
    await this.files.updateCurrentStorageObject(
      fileId,
      ownerId,
      storageObjectId,
    );

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'UPLOAD', 'FILE', fileId, {
        name: file.name,
        versionNumber: version.versionNumber,
      }),
    );

    return version;
  }
}
