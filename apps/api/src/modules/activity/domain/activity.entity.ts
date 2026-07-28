import type { ActivityAction, ActivityTargetType } from '@prisma/client';

export type { ActivityAction, ActivityTargetType };

export interface Activity {
  id: string;
  actorId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}
