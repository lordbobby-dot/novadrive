import type { NotificationType } from '@prisma/client';

export type { NotificationType };

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}
