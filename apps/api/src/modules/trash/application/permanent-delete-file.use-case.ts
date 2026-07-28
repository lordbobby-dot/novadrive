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

/** Deletes every StorageObject a file's content has ever pointed at (current version and every
 * historical one), in S3 first and then in Postgres. Deleting the StorageObject rows cascades
 * (via the DB schema) to delete the File row itself, its FileVersion rows, and its Trash/Tag/
 * Favorite rows — there is no separate "delete the File row" step. Also releases whatever quota
 * each deleted StorageObject had reserved (see QuotaService.releaseMany) — a file trashed then
 * permanently deleted still counted against quota the whole time it sat in Trash (see
 * docs/quota.md), so this is the only point its space is actually freed. */
@Injectable()
export class PermanentDeleteFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FILE_VERSION_REPOSITORY)
    private readonly versions: FileVersionRepository,
    @Inject(TRASH_REPOSITORY) private readonly trash: TrashRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly events: EventEmitter2,
    private readonly quota: QuotaService,
  ) {}

  async execute(id: string, ownerId: string): Promise<void> {
    const file = await this.files.findById(id, ownerId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Union with the file's own current pointer rather than trusting FileVersion rows alone —
    // a file created via the legacy stub POST /files path (no real upload, no FileVersion ever
    // written for it) would otherwise leak its StorageObject forever, since the row it points at
    // wouldn't show up in either list.
    const versionStorageObjectIds =
      await this.versions.listStorageObjectIdsForFiles([id]);
    const storageObjectIds = Array.from(
      new Set([...versionStorageObjectIds, file.storageObjectId]),
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
    await this.quota.releaseMany(locations);

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'DELETE', 'FILE', id, {
        name: file.name,
        permanent: true,
      }),
    );
  }
}
