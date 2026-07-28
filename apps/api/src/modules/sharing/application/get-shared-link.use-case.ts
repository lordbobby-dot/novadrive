import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import { isSharedLinkExpired } from '../domain/shared-link.entity';
import type { SharedLink } from '../domain/shared-link.entity';
import {
  SHARED_LINK_REPOSITORY,
  type SharedLinkRepository,
} from '../domain/shared-link.repository';
import { SharedLinkPasswordRequiredException } from '../domain/shared-link-access.exception';
import { verifyPassword } from '../infrastructure/password-hash';

export interface SharedLinkAccessResult {
  link: SharedLink;
  resourceName: string;
  contentType: string | null;
  size: string | null;
}

/** The public, unauthenticated read path — `GET /shared-links/:token`. Distinguishes "wrong or
 * missing password" (SharedLinkPasswordRequiredException, so the frontend shows a password
 * prompt) from "doesn't exist / expired" (plain NotFoundException, so the frontend shows a dead
 * link page) — an expired link and a never-existent token look identical on purpose, so a
 * password-guessing attempt can't be used to probe whether a token exists at all. */
@Injectable()
export class GetSharedLinkUseCase {
  constructor(
    @Inject(SHARED_LINK_REPOSITORY)
    private readonly links: SharedLinkRepository,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
  ) {}

  async execute(
    token: string,
    password?: string,
  ): Promise<SharedLinkAccessResult> {
    const link = await this.links.findByToken(token);
    if (!link || isSharedLinkExpired(link)) {
      throw new NotFoundException('Link not found');
    }

    if (link.passwordHash) {
      const provided = password
        ? await verifyPassword(password, link.passwordHash)
        : false;
      if (!provided) {
        throw new SharedLinkPasswordRequiredException();
      }
    }

    if (link.resourceType === 'FOLDER') {
      const folder = await this.folders.findByIdUnscoped(link.resourceId);
      if (!folder) throw new NotFoundException('Link not found');
      return { link, resourceName: folder.name, contentType: null, size: null };
    }

    const file = await this.files.findByIdUnscoped(link.resourceId);
    if (!file) throw new NotFoundException('Link not found');
    return {
      link,
      resourceName: file.name,
      contentType: file.contentType,
      size: file.size,
    };
  }
}
