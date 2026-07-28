import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { File } from '../../files/domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import { isSelfOrDescendant } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  isSharedLinkExpired,
  isSharedLinkDownloadLimitReached,
} from '../domain/shared-link.entity';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from '../domain/shared-link.repository';
import { SharedLinkPasswordRequiredException } from '../domain/shared-link-access.exception';
import { verifyPassword } from '../infrastructure/password-hash';

export interface SharedLinkDownload {
  url: string;
  expiresAt: Date;
  fileName: string;
}

/** Downloading (as opposed to just viewing the landing page) is where `maxDownloads` is actually
 * enforced — re-checked here, not just at link-view time, since a link can be viewed many times
 * (e.g. page refresh) without that counting against the download quota. The increment is a
 * single atomic conditional UPDATE (see SharedLinkRepository.incrementDownloadCountIfUnderLimit)
 * so two concurrent requests right at the limit can't both succeed.
 *
 * A FOLDER-type link additionally requires `fileId` — the specific file discovered while
 * browsing (see ListSharedFolderFilesUseCase) — and validates it actually lives inside the
 * shared subtree (self or descendant of the link's own root folder, same check
 * SharedFolderAccessResolver uses for browsing) before ever incrementing the download counter,
 * so a guessed/unrelated fileId can't burn through the owner's download quota. */
@Injectable()
export class DownloadViaSharedLinkUseCase {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async execute(
    token: string,
    password?: string,
    fileId?: string,
  ): Promise<SharedLinkDownload> {
    const link = await this.links.findByToken(token);
    if (!link || isSharedLinkExpired(link)) {
      throw new NotFoundException('Link not found');
    }
    if (link.passwordHash) {
      const provided = password
        ? await verifyPassword(password, link.passwordHash)
        : false;
      if (!provided) throw new SharedLinkPasswordRequiredException();
    }
    if (!link.canDownload) {
      throw new ForbiddenException('This link does not allow downloads');
    }
    if (isSharedLinkDownloadLimitReached(link)) {
      throw new ForbiddenException('This link has reached its download limit');
    }

    let file: File | null;
    if (link.resourceType === 'FILE') {
      const updated = await this.links.incrementDownloadCountIfUnderLimit(
        link.id,
      );
      if (!updated) {
        throw new ForbiddenException(
          'This link has reached its download limit',
        );
      }
      file = await this.files.findByIdUnscoped(link.resourceId);
      if (!file) throw new NotFoundException('Link not found');
    } else {
      if (!fileId) {
        throw new BadRequestException(
          'fileId is required to download a file from a shared folder',
        );
      }
      file = await this.files.findByIdUnscoped(fileId);
      if (file) {
        const [rootFolder, fileFolder] = await Promise.all([
          this.folders.findByIdUnscoped(link.resourceId),
          this.folders.findByIdUnscoped(file.folderId),
        ]);
        if (
          !rootFolder ||
          !fileFolder ||
          !isSelfOrDescendant(rootFolder, fileFolder)
        ) {
          file = null;
        }
      }
      if (!file) throw new NotFoundException('File not found');

      const updated = await this.links.incrementDownloadCountIfUnderLimit(
        link.id,
      );
      if (!updated) {
        throw new ForbiddenException(
          'This link has reached its download limit',
        );
      }
    }

    const { url, expiresAt } = await this.storage.presignGetObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
      disposition: 'attachment',
      fileName: file.name,
      contentType: file.contentType,
    });

    return { url, expiresAt, fileName: file.name };
  }
}
