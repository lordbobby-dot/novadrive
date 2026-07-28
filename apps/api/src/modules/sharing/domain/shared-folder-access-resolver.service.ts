import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Folder } from '../../folders/domain/folder.entity';
import { isSelfOrDescendant } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import { isSharedLinkExpired, type SharedLink } from './shared-link.entity';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from './shared-link.repository';
import { SharedLinkPasswordRequiredException } from './shared-link-access.exception';
import { verifyPassword } from '../infrastructure/password-hash';

export interface ResolvedSharedFolderAccess {
  link: SharedLink;
  rootFolder: Folder;
  targetFolder: Folder;
}

/** Shared by every "browse a folder shared via a public link" use case
 * (ListSharedFolderSubfoldersUseCase, ListSharedFolderFilesUseCase,
 * GetSharedFolderBreadcrumbUseCase) — the token/password/expiry checks are the same ones
 * GetSharedLinkUseCase already does for the single-resource metadata endpoint, plus the
 * folder-specific piece those don't need: confirming the requested `folderId` (a query param,
 * so any string) is actually the link's own shared folder or one of its descendants, not an
 * unrelated folder the caller is trying to walk into by guessing an id. */
@Injectable()
export class SharedFolderAccessResolver {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async resolve(
    token: string,
    password: string | undefined,
    folderId: string | undefined,
  ): Promise<ResolvedSharedFolderAccess> {
    const link = await this.links.findByToken(token);
    if (!link || isSharedLinkExpired(link)) {
      throw new NotFoundException('Link not found');
    }
    if (link.resourceType !== 'FOLDER') {
      throw new BadRequestException('This link does not point to a folder');
    }
    if (link.passwordHash) {
      const provided = password
        ? await verifyPassword(password, link.passwordHash)
        : false;
      if (!provided) {
        throw new SharedLinkPasswordRequiredException();
      }
    }
    if (!link.canView) {
      throw new ForbiddenException('This link is not viewable');
    }

    const rootFolder = await this.folders.findByIdUnscoped(link.resourceId);
    if (!rootFolder) {
      throw new NotFoundException('Link not found');
    }

    const targetId = folderId ?? rootFolder.id;
    const targetFolder =
      targetId === rootFolder.id
        ? rootFolder
        : await this.folders.findByIdUnscoped(targetId);
    if (!targetFolder || !isSelfOrDescendant(rootFolder, targetFolder)) {
      throw new NotFoundException('Folder not found in this shared link');
    }

    return { link, rootFolder, targetFolder };
  }
}
