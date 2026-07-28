import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVITY_EVENT,
  ActivityEvent,
} from '../../../common/events/activity.event';
import { buildCursorPage } from '../../../common/pagination/cursor-page';
import {
  buildChildPath,
  isSelfOrDescendant,
} from '../../folders/domain/folder.entity';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../../files/domain/file.repository';
import { CopyFileUseCase } from './copy-file.use-case';

const PAGE_SIZE = 100;

@Injectable()
export class CopyFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
    private readonly copyFile: CopyFileUseCase,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookups — PermissionGuard has already verified `ownerId` (the actor, who becomes
   * the owner of every newly created copy — see CreateFolderUseCase) has VIEWER+ on the source
   * folder and EDITOR+ on the target parent. */
  async execute(params: {
    id: string;
    ownerId: string;
    targetParentId: string;
    name?: string;
  }): Promise<Folder> {
    const { id, ownerId, targetParentId, name } = params;

    const source = await this.folders.findByIdUnscoped(id);
    if (!source) {
      throw new NotFoundException('Folder not found');
    }

    const targetParent = await this.folders.findByIdUnscoped(targetParentId);
    if (!targetParent) {
      throw new NotFoundException('Target folder not found');
    }

    if (isSelfOrDescendant(source, targetParent)) {
      throw new BadRequestException(
        'Cannot copy a folder into itself or one of its own descendants',
      );
    }

    return this.copyInto(source, ownerId, targetParent, name ?? source.name);
  }

  /** Deep-copies `source` (its own row, every file inside it, and every subfolder recursively)
   * as a new child of `targetParent`. */
  private async copyInto(
    source: Folder,
    ownerId: string,
    targetParent: Folder,
    name: string,
  ): Promise<Folder> {
    const newFolder = await this.folders.create({
      ownerId,
      parentId: targetParent.id,
      name,
      path: buildChildPath(targetParent),
      depth: targetParent.depth + 1,
      // Inherited from the destination, same as CreateFolderUseCase — a copy into a workspace
      // becomes part of that workspace regardless of the source's own scope.
      organizationId: targetParent.organizationId,
      workspaceId: targetParent.workspaceId,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(ownerId, 'COPY', 'FOLDER', newFolder.id, {
        name,
        sourceFolderId: source.id,
      }),
    );

    for (const file of await this.listAllFiles(source.id, ownerId)) {
      await this.copyFile.copy(file, ownerId, newFolder, file.name);
    }

    for (const child of await this.listAllChildren(source.id, ownerId)) {
      await this.copyInto(child, ownerId, newFolder, child.name);
    }

    return newFolder;
  }

  private async listAllFiles(folderId: string, ownerId: string) {
    const all = [];
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.files.findByFolder({
        ownerId,
        folderId,
        cursor,
        limit: PAGE_SIZE,
      });
      const { items, nextCursor } = buildCursorPage(rows, PAGE_SIZE);
      all.push(...items);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return all;
  }

  private async listAllChildren(parentId: string, ownerId: string) {
    const all: Folder[] = [];
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.folders.findChildren({
        ownerId,
        parentId,
        cursor,
        limit: PAGE_SIZE,
      });
      const { items, nextCursor } = buildCursorPage(rows, PAGE_SIZE);
      all.push(...items);
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return all;
  }
}
