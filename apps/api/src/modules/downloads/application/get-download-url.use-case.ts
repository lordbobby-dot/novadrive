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
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
  fileName: string;
  contentType: string;
  size: string;
}

@Injectable()
export class GetDownloadUrlUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has VIEWER+ on the file,
   * which may belong to someone else. */
  async execute(id: string, actorId: string): Promise<SignedUrlResult> {
    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const { url, expiresAt } = await this.storage.presignGetObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      disposition: 'attachment',
      fileName: file.name,
      contentType: file.contentType,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'DOWNLOAD', 'FILE', id, { name: file.name }),
    );
    await this.files.touchLastAccessed(id);

    return {
      url,
      expiresAt,
      fileName: file.name,
      contentType: file.contentType,
      size: file.size,
    };
  }
}
