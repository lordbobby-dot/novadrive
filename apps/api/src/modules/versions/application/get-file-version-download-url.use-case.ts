import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../domain/file-version.repository';
import type { SignedUrlResult } from '../../downloads/application/get-download-url.use-case';

@Injectable()
export class GetFileVersionDownloadUrlUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  /** Unscoped lookup — PermissionGuard has already verified `actorId` has VIEWER+ on the file,
   * which may belong to someone else. */
  async execute(
    fileId: string,
    actorId: string,
    versionNumber: number,
  ): Promise<SignedUrlResult> {
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

    const { url, expiresAt } = await this.storage.presignGetObject({
      bucket: version.bucket,
      objectKey: version.objectKey,
      disposition: 'attachment',
      fileName: file.name,
      contentType: version.contentType,
    });

    return {
      url,
      expiresAt,
      fileName: file.name,
      contentType: version.contentType,
      size: version.size,
    };
  }
}
