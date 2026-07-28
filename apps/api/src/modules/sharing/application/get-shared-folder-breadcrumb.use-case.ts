import { Inject, Injectable } from '@nestjs/common';
import {
  parseAncestorIds,
  type Folder,
} from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import { SharedFolderAccessResolver } from '../domain/shared-folder-access-resolver.service';

/** Unlike GetBreadcrumbUseCase (self-service, returns the chain from the user's own Drive root),
 * this returns only the chain from the shared link's own root folder down to the requested
 * folder — an anonymous visitor never learns anything about where the shared folder sits in the
 * owner's real Drive, matching SharedLinkAccessResponseDto's "reveal nothing about the owner"
 * principle. */
@Injectable()
export class GetSharedFolderBreadcrumbUseCase {
  constructor(
    private readonly access: SharedFolderAccessResolver,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async execute(
    token: string,
    password: string | undefined,
    folderId: string | undefined,
  ): Promise<Folder[]> {
    const { rootFolder, targetFolder } = await this.access.resolve(
      token,
      password,
      folderId,
    );

    if (targetFolder.id === rootFolder.id) {
      return [rootFolder];
    }

    const ancestorIds = parseAncestorIds(targetFolder.path);
    const rootIndex = ancestorIds.indexOf(rootFolder.id);
    const relativeIds = ancestorIds.slice(rootIndex);

    const ancestors = await this.folders.findByIds(
      relativeIds,
      targetFolder.ownerId,
    );
    const byId = new Map(ancestors.map((folder) => [folder.id, folder]));
    const ordered = relativeIds
      .map((id) => (id === rootFolder.id ? rootFolder : byId.get(id)))
      .filter((folder): folder is Folder => folder !== undefined);

    return [...ordered, targetFolder];
  }
}
