import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import {
  FILE_VERSION_REPOSITORY,
  type FileVersionRepository,
} from '../../versions/domain/file-version.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  TRASH_REPOSITORY,
  type TrashRepository,
} from '../domain/trash.repository';
import { QuotaService } from '../../quota/domain/quota.service';

/** Deletes every StorageObject referenced by any file anywhere in the folder's subtree first
 * (S3, then Postgres — deleting a StorageObject cascades away its File and FileVersion rows),
 * then deletes the folder row itself, which cascades (via the DB schema) to delete every
 * descendant Folder row and any Trash/Tag/Favorite rows still pointing at them. Also releases
 * whatever quota each deleted StorageObject had reserved — see
 * PermanentDeleteFileUseCase. */
@Injectable()
export class PermanentDeleteFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    @Inject(TRASH_REPOSITORY) private readonly trash: TrashRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly events: EventEmitter2,
    private readonly quota: QuotaService,
  ) {}

  async execute(id: string, ownerId: string): Promise<void> {
    const folder = await this.folders.findById(id, ownerId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const descendantIds = await this.folders.findDescendantIds(id, ownerId);
    const allFolderIds = [id, ...descendantIds];

    const filesInSubtree = await this.files.findByFolderIds(
      allFolderIds,
      ownerId,
    );
    const fileIds = filesInSubtree.map((file) => file.id);

    // Union with each file's own current pointer rather than trusting FileVersion rows alone —
    // see PermanentDeleteFileUseCase for why (a stub-created file has no FileVersion row).
    const versionStorageObjectIds =
      await this.versions.listStorageObjectIdsForFiles(fileIds);
    const storageObjectIds = Array.from(
      new Set([
        ...versionStorageObjectIds,
        ...filesInSubtree.map((file) => file.storageObjectId),
      ]),
    );
    const locations =
      await this.trash.getStorageObjectLocations(storageObjectIds);

    await Promise.all(
      locations.map((location) =>
        this.storage.deleteObject({
          bucket: location.bucket,
          objectKey: location.objectKey,
        }),
      ),
    );
    await this.trash.deleteStorageObjects(storageObjectIds);
    await this.folders.deleteRow(id);
    await this.quota.releaseMany(locations);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'DELETE', 'FOLDER', id, {
        name: folder.name,
        permanent: true,
        folderCount: allFolderIds.length,
        fileCount: fileIds.length,
      }),
    );
  }
}
