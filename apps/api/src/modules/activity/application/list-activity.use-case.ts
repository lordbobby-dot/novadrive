import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import { PermissionResolver } from '../../sharing/domain/permission-resolver.service';
import type {
  Activity,
  ActivityAction,
  ActivityTargetType,
} from '../domain/activity.entity';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../domain/activity.repository';

export interface ListActivityParams {
  ownerId: string;
  targetId?: string;
  targetType?: ActivityTargetType;
  action?: ActivityAction;
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: string;
  limit: number;
}

function isShareableTarget(
  targetType: ActivityTargetType | undefined,
): targetType is 'FILE' | 'FOLDER' {
  return targetType === 'FILE' || targetType === 'FOLDER';
}

@Injectable()
export class ListActivityUseCase {
  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activity: ActivityRepository,
    private readonly resolver: PermissionResolver,
  ) {}

  /** Two modes, switched on whether `targetId` names a shareable resource:
   *  - Per-resource tab (`targetId` + `targetType` FILE/FOLDER): shows every actor's activity on
   *    that resource, gated on `ownerId` (the viewer) having at least VIEWER on it — collaborators
   *    should see the resource's full history, not just their own actions on it.
   *  - Account-level "my activity" feed (no targetId, or a non-shareable targetType like ACCOUNT):
   *    scoped to the viewer's own actions, same as before sharing existed — inherently personal,
   *    so no permission check applies. */
  async execute(params: ListActivityParams): Promise<CursorPage<Activity>> {
    const resourceScoped =
      params.targetId !== undefined && isShareableTarget(params.targetType);

    if (resourceScoped) {
      await this.resolver.requireRole(
        params.ownerId,
        params.targetType as 'FILE' | 'FOLDER',
        params.targetId!,
        'VIEWER',
      );
    }

    const rows = await this.activity.list({
      actorId: resourceScoped ? undefined : params.ownerId,
      targetId: params.targetId,
      targetType: params.targetType,
      action: params.action,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      cursor: params.cursor,
      limit: params.limit,
    });
    return buildCursorPage(rows, params.limit);
  }
}
