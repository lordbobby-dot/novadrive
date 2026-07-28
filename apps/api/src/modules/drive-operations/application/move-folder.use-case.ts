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
import {
  buildChildPath,
  isSelfOrDescendant,
} from '../../folders/domain/folder.entity';
import type { Folder } from '../../folders/domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../../folders/domain/folder.repository';

@Injectable()
export class MoveFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Unscoped lookups — PermissionGuard has already verified `actorId` has EDITOR+ on both the
   * folder and the target parent, which may belong to someone else. Moving a folder never
   * changes its (or its subtree's) ownerId — see PrismaFolderRepository.move. */
  async execute(params: {
    id: string;
    actorId: string;
    targetParentId: string;
  }): Promise<Folder> {
    const { id, actorId, targetParentId } = params;

    const folder = await this.folders.findByIdUnscoped(id);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.parentId === null) {
      throw new BadRequestException('The root folder cannot be moved');
    }

    const targetParent = await this.folders.findByIdUnscoped(targetParentId);
    if (!targetParent) {
      throw new NotFoundException('Target folder not found');
    }

    if (isSelfOrDescendant(folder, targetParent)) {
      throw new BadRequestException(
        'Cannot move a folder into itself or one of its own descendants',
      );
    }

    // A move never re-propagates organizationId/workspaceId onto the moved subtree (see
    // PrismaFolderRepository.move) — crossing scope boundaries would silently leave stale
    // values, breaking PermissionResolver's org-role fallback for org-scoped content or leaking
    // it for content moved back out. Out of scope for this milestone; only same-scope moves
    // (personal-to-personal, or within the same workspace) are allowed.
    if (
      folder.workspaceId !== targetParent.workspaceId ||
      folder.organizationId !== targetParent.organizationId
    ) {
      throw new BadRequestException(
        'Cannot move a folder between personal Drive and an org workspace, or between workspaces',
      );
    }

    if (folder.parentId === targetParentId) {
      return folder;
    }

    const moved = await this.folders.move({
      id,
      ownerId: actorId,
      newParentId: targetParentId,
      newPath: buildChildPath(targetParent),
      newDepth: targetParent.depth + 1,
    });

    this.events.emit(
      ACTIVITY_EVENT,
      new ActivityEvent(actorId, 'MOVE', 'FOLDER', id, {
        name: folder.name,
        fromParentId: folder.parentId,
        toParentId: targetParentId,
      }),
    );

    return moved;
  }
}
