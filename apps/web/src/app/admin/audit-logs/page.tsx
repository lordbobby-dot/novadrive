"use client";

import { useState } from "react";
import type { AuditEventType, AuditLogResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuditLog } from "@/hooks/use-admin";
import { formatDistanceToNow } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  SESSION_REVOKED: "A session was revoked",
  AUTH_TOKEN_REJECTED: "Rejected sign-in attempt",
  PERMISSION_ESCALATION_ATTEMPT: "Blocked a permission-escalation attempt",
  PERMISSION_GRANTED: "Granted access to a resource",
  PERMISSION_REVOKED: "Revoked access to a resource",
  VIRUS_DETECTED: "An upload was blocked by the virus scan",
  USER_SUSPENDED: "Suspended a user",
  USER_UNSUSPENDED: "Unsuspended a user",
  ADMIN_ROLE_GRANTED: "Granted the admin role",
  ADMIN_ROLE_REVOKED: "Revoked the admin role",
};

const EVENT_TYPES = Object.keys(EVENT_LABELS) as AuditEventType[];

function describe(entry: AuditLogResponse): string {
  return EVENT_LABELS[entry.eventType] ?? entry.eventType;
}

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function AdminAuditLogsPage() {
  const [actorId, setActorId] = useState("");
  const [eventType, setEventType] = useState<AuditEventType | "">("");
  const [targetType, setTargetType] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<AuditLogResponse[]>([]);

  const { data, isLoading, isFetching } = useAdminAuditLog({
    actorId: actorId || undefined,
    eventType: eventType || undefined,
    targetType: targetType || undefined,
    cursor,
    limit: 20,
  });

  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function reset() {
    setAccumulated([]);
    setCursor(undefined);
  }

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Audit Logs</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-actor">Actor ID</Label>
          <Input
            id="filter-actor"
            value={actorId}
            onChange={(e) => {
              reset();
              setActorId(e.target.value);
            }}
            placeholder="Leave empty for everyone"
            className="h-8 w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-event">Event</Label>
          <select
            id="filter-event"
            className={selectClass}
            value={eventType}
            onChange={(e) => {
              reset();
              setEventType(e.target.value as AuditEventType | "");
            }}
          >
            <option value="">Any</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVENT_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-target">Target type</Label>
          <select
            id="filter-target"
            className={selectClass}
            value={targetType}
            onChange={(e) => {
              reset();
              setTargetType(e.target.value);
            }}
          >
            <option value="">Any</option>
            <option value="USER">User</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No matching events.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm">
              <span
                className={cn(
                  "size-1.5 shrink-0 self-center rounded-full",
                  item.outcome === "FAILURE" ? "bg-destructive" : "bg-primary",
                )}
                aria-hidden
              />
              <span className="flex-1 truncate">{describe(item)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                actor: {item.actorId ?? "unknown"}
              </span>
              {item.targetId && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  target: {item.targetId}
                </span>
              )}
              {item.ipAddress && (
                <span className="shrink-0 text-xs text-muted-foreground">{item.ipAddress}</span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDistanceToNow(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
