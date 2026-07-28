import type { AuditEventType, AuditOutcome } from '@prisma/client';

/** Security-focused sibling of ACTIVITY_EVENT (see activity.event.ts) — a separate bus rather
 * than reusing ActivityEvent because audit-worthy moments include failures (a rejected auth
 * token, a blocked permission escalation) that never produce an Activity row, and because an
 * AuditLog entry can exist with no resolvable actor at all. */
export const AUDIT_EVENT = 'audit';

export class AuditEvent {
  constructor(
    public readonly eventType: AuditEventType,
    public readonly outcome: AuditOutcome,
    public readonly actorId: string | null = null,
    public readonly targetType?: string,
    public readonly targetId?: string,
    public readonly metadata?: Record<string, unknown>,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
  ) {}
}
