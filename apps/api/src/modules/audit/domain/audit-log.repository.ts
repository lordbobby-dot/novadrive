import type {
  AuditLog,
  AuditEventType,
  AuditOutcome,
} from './audit-log.entity';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface CreateAuditLogParams {
  actorId: string | null;
  eventType: AuditEventType;
  outcome: AuditOutcome;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListAuditLogParams {
  /** Omitted for an admin-wide query (see AdminModule) — every other caller (the personal
   * `GET /audit-log` endpoint) always scopes to the current user's own trail. */
  actorId?: string;
  eventType?: AuditEventType;
  /** Admin-only filter — e.g. `targetType: 'USER'` to see only user-management actions. */
  targetType?: string;
  cursor?: string;
  limit: number;
}

export interface AuditLogRepository {
  create(params: CreateAuditLogParams): Promise<AuditLog>;
  /** Returns up to `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  list(params: ListAuditLogParams): Promise<AuditLog[]>;
  /** Deletes every row at or older than `cutoff` — the retention purge job's only write. Returns
   * the count deleted for the job's own log line. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
