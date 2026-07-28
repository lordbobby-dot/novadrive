import { randomUUID } from 'node:crypto';
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
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import { QuotaService } from '../../quota/domain/quota.service';
import { resolveQuotaSubject } from '../../quota/domain/quota-subject.resolver';

@Injectable()
export class CopyFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly events: EventEmitter2,
    private readonly quota: QuotaService,
  ) {}

  /** Unscoped lookups — PermissionGuard has already verified `ownerId` (the actor, who becomes
   * the new copy's owner — same "creator owns" convention InitiateUploadUseCase uses) has
   * VIEWER+ on the source file and EDITOR+ on the target folder. */
  async execute(params: {
    id: string;
    ownerId: string;
    targetFolderId: string;
    name?: string;
  }): Promise<File> {
    const { id, ownerId, targetFolderId, name } = params;

    const source = await this.files.findByIdUnscoped(id);
    if (!source) {
      throw new NotFoundException('File not found');
    }

    const targetFolder = await this.folders.findByIdUnscoped(targetFolderId);
    if (!targetFolder) {
      throw new NotFoundException('Target folder not found');
    }

    return this.copy(source, ownerId, targetFolder, name ?? source.name);
  }

  /** The actual copy, factored out so CopyFolderUseCase can reuse it for every file inside a
   * folder it's deep-copying without duplicating the S3-copy-then-create-row logic. That caller
   * already knows the target folder exists, so it skips straight here — passing the Folder
   * itself (not just its id) so quota can be resolved without a redundant lookup. */
  async copy(
    source: File,
    ownerId: string,
    targetFolder: Folder,
    name: string,
  ): Promise<File> {
    // Reserved before any S3 call, same as InitiateUploadUseCase — a copy consumes just as much
    // real storage as an upload, so it must count against the target's quota the same way. A
    // QuotaExceededException here means no S3 copy was ever made.
    const quotaSubject = resolveQuotaSubject(targetFolder);
    await this.quota.reserve(quotaSubject, source.size);

    // Never point a second File at the source's StorageObject — it's `@unique` per File on
    // purpose, so each copy gets fully independent storage (no shared-ownership ambiguity for
    // later per-file delete/versioning).
    const objectKey = `uploads/${ownerId}/${randomUUID()}`;
    const { eTag } = await this.storage.copyObject({
      sourceBucket: source.bucket,
      sourceObjectKey: source.objectKey,
      destinationBucket: source.bucket,
      destinationObjectKey: objectKey,
    });

    const copy = await this.files.copyToNewStorageObject({
      ownerId,
      folderId: targetFolder.id,
      name,
      bucket: source.bucket,
      objectKey,
      contentType: source.contentType,
      size: source.size,
      region: source.region,
      eTag,
      quotaSubjectType: quotaSubject.subjectType,
      quotaSubjectId: quotaSubject.subjectId,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'COPY', 'FILE', copy.id, {
        name,
        sourceFileId: source.id,
      }),
    );

    return copy;
  }
}
