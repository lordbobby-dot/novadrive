import type {
  Activity,
  ActivityAction,
  ActivityTargetType,
} from './activity.entity';

export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');

export interface CreateActivityParams {
  actorId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export interface ListActivityParams {
  /** Omitted when this is a per-resource feed (`targetId` + a shareable `targetType`) — in that
   * case every actor's activity on the resource is shown, not just the caller's own, since
   * PermissionResolver has already gated access to the resource itself. Present for the
   * account-level "my activity" feed, which is inherently personal and needs no permission
   * check. */
  actorId?: string;
  targetId?: string;
  targetType?: ActivityTargetType;
  action?: ActivityAction;
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: string;
  limit: number;
}

export interface ActivityRepository {
  create(params: CreateActivityParams): Promise<Activity>;
  /** Returns up to `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  list(params: ListActivityParams): Promise<Activity[]>;
}
