export type AuditEventType =
  | "LOGIN"
  | "LOGOUT"
  | "SESSION_REVOKED"
  | "AUTH_TOKEN_REJECTED"
  | "PERMISSION_ESCALATION_ATTEMPT"
  | "PERMISSION_GRANTED"
  | "PERMISSION_REVOKED"
  | "VIRUS_DETECTED"
  | "USER_SUSPENDED"
  | "USER_UNSUSPENDED"
  | "ADMIN_ROLE_GRANTED"
  | "ADMIN_ROLE_REVOKED";

export type AuditOutcome = "SUCCESS" | "FAILURE";

export interface AuditLogResponse {
  id: string;
  actorId: string | null;
  eventType: AuditEventType;
  outcome: AuditOutcome;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
