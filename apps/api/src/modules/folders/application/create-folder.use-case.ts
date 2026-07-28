import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildChildPath, type Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

export interface CreateFolderParams {
  ownerId: string;
  parentId: string;
  name: string;
}

@Injectable()
export class CreateFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  /** The parent lookup is unscoped — PermissionGuard already verified `params.ownerId` (the
   * creator) has EDITOR+ on the parent, which may belong to someone else. The new folder is
   * still owned by its creator, not the parent's owner — simplest ownership rule, avoids a
   * collaborator being surprised that something they created belongs to someone else. */
  async execute(params: CreateFolderParams): Promise<Folder> {
    const parent = await this.folders.findByIdUnscoped(params.parentId);
    if (!parent) {
      throw new NotFoundException('Parent folder not found');
    }

    return this.folders.create({
      ownerId: params.ownerId,
      parentId: parent.id,
      name: params.name,
      path: buildChildPath(parent),
      depth: parent.depth + 1,
      // Inherited from the parent, not the creator — a subfolder created anywhere inside an org
      // workspace stays part of that workspace regardless of who created it.
      organizationId: parent.organizationId,
      workspaceId: parent.workspaceId,
    });
  }
}
