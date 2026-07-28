import type { AuditEventType, AuditOutcome } from '@prisma/client';

export type { AuditEventType, AuditOutcome };

export interface AuditLog {
  id: string;
  actorId: string | null;
  eventType: AuditEventType;
  outcome: AuditOutcome;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
