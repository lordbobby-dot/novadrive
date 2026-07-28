export type ActivityAction =
  | "UPLOAD"
  | "DOWNLOAD"
  | "DELETE"
  | "RESTORE"
  | "RENAME"
  | "MOVE"
  | "COPY"
  | "SHARE"
  | "LOGIN"
  | "LOGOUT"
  | "PERMISSION_CHANGE"
  | "VERSION_RESTORE";

export type ActivityTargetType = "FILE" | "FOLDER" | "ACCOUNT";

export interface ActivityResponse {
  id: string;
  actorId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
