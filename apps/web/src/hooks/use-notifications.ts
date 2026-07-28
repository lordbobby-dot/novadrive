"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CursorPage, NotificationResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";
import { useRealtimeSocket } from "@/lib/realtime-context";

const NOTIFICATIONS_KEY = ["notifications"];
const UNREAD_COUNT_KEY = ["notifications", "unread-count"];

// Notification.payload now carries actorName/targetName (resolved server-side by
// NotificationEventListener, see docs/realtime.md) alongside the raw ids — fall back to the
// generic "a file"/"a folder" phrasing when a name is missing (e.g. the resource or actor was
// since deleted).
export function describeNotification(
  notification: Pick<NotificationResponse, "type" | "payload">,
): string {
  const resource = notification.payload.targetType === "FOLDER" ? "folder" : "file";
  const actorName = notification.payload.actorName as string | null | undefined;
  const targetName = notification.payload.targetName as string | null | undefined;
  const resourceLabel = targetName ? `"${targetName}"` : `a ${resource}`;
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (notification.type) {
    case "SHARE": {
      const role = notification.payload.role as string | undefined;
      return role
        ? `${actorPrefix}invited you as ${role.toLowerCase()} on ${resourceLabel}`
        : `${actorPrefix}invited you to ${resourceLabel}`;
    }
    case "PERMISSION_CHANGE": {
      if (notification.payload.revoked) {
        return `Your access to ${resourceLabel} was removed`;
      }
      const role = notification.payload.role as string | undefined;
      return role
        ? `Your role on ${resourceLabel} changed to ${role.toLowerCase()}`
        : `Your access to ${resourceLabel} changed`;
    }
    case "COMMENT":
      return actorName
        ? `${actorName} commented on ${resourceLabel}`
        : `New comment on ${resourceLabel}`;
    case "QUOTA_WARNING": {
      const percent = notification.payload.thresholdPercent as number | undefined;
      const subjectName = notification.payload.subjectName as string | null | undefined;
      const subjectLabel = subjectName ? `${subjectName}'s` : "Your";
      return percent
        ? `${subjectLabel} storage is ${percent}% full`
        : `${subjectLabel} storage quota warning`;
    }
    default:
      return "New notification";
  }
}

export function useNotifications() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => authedFetch<CursorPage<NotificationResponse>>("/notifications?limit=20"),
  });
}

export function useUnreadCount() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => authedFetch<{ count: number }>("/notifications/unread-count"),
  });
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
  }, [queryClient]);
}

export function useMarkNotificationRead() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) =>
      authedFetch<NotificationResponse>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () =>
      authedFetch<{ count: number }>("/notifications/read-all", { method: "PATCH" }),
    onSuccess: invalidate,
  });
}

/** Keeps the notifications query cache fresh and surfaces a toast as `notification:new` events
 * arrive over the socket. Safe to mount once (NotificationBell) — react-query dedupes the
 * underlying queries even without this running elsewhere. */
export function useNotificationsRealtimeSync() {
  const socket = useRealtimeSocket();
  const invalidate = useInvalidateNotifications();

  useEffect(() => {
    if (!socket) return;
    function handleNew(notification: NotificationResponse) {
      invalidate();
      toast(describeNotification(notification));
    }
    socket.on("notification:new", handleNew);
    return () => {
      socket.off("notification:new", handleNew);
    };
  }, [socket, invalidate]);
}
