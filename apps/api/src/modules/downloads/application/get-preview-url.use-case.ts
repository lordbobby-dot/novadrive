import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import type { SignedUrlResult } from './get-download-url.use-case';

@Injectable()
export class GetPreviewUrlUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has VIEWER+ on the file,
   * which may belong to someone else. */
  async execute(id: string, _actorId: string): Promise<SignedUrlResult> {
    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    // "inline" lets the browser render the response directly (img/video/iframe/fetch) instead
    // of forcing a download — the only difference from the download URL's disposition header.
    const { url, expiresAt } = await this.storage.presignGetObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      disposition: 'inline',
      fileName: file.name,
      contentType: file.contentType,
    });
    await this.files.touchLastAccessed(file.id);

    return {
      url,
      expiresAt,
      fileName: file.name,
      contentType: file.contentType,
      size: file.size,
    };
  }
}
