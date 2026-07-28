"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "@/lib/format-date";
import {
  describeNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtimeSync,
  useUnreadCount,
} from "@/hooks/use-notifications";

function NotificationRow({ notification }: { notification: NotificationResponse }) {
  const markRead = useMarkNotificationRead();
  const isUnread = notification.readAt === null;
  const targetId = notification.payload.targetId as string | undefined;
  const isFolder = notification.payload.targetType === "FOLDER";
  const isQuotaWarning = notification.type === "QUOTA_WARNING";

  const content = (
    <div className="flex w-full flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-sm">
        {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
        <span className="truncate">{describeNotification(notification)}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(notification.createdAt)}
      </span>
    </div>
  );

  return (
    <DropdownMenuItem
      className="items-start py-2"
      onClick={() => {
        if (isUnread) markRead.mutate(notification.id);
      }}
      render={
        isQuotaWarning ? (
          <Link href="/drive/storage" />
        ) : isFolder && targetId ? (
          <Link href={`/drive/${targetId}`} />
        ) : undefined
      }
    >
      {content}
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  useNotificationsRealtimeSync();
  const { data } = useNotifications();
  const { data: unread } = useUnreadCount();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unread?.count ?? 0;
  const items = data?.items ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" aria-label="Notifications" className="relative" />}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Notifications</div>
        {count > 0 && (
          <DropdownMenuItem onClick={() => markAllRead.mutate()}>Mark all read</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
