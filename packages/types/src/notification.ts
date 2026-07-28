export type NotificationType =
  | "SHARE"
  | "PERMISSION_CHANGE"
  | "COMMENT"
  | "QUOTA_WARNING";

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
