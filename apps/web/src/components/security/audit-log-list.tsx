"use client";

import { useState } from "react";
import { formatDistanceToNow } from "@/lib/format-date";
import type { AuditLogResponse } from "@novadrive/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuditLog, type AuditLogFilters } from "@/hooks/use-audit-log";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  SESSION_REVOKED: "A session was revoked",
  AUTH_TOKEN_REJECTED: "Rejected sign-in attempt (invalid or expired token)",
  PERMISSION_ESCALATION_ATTEMPT: "Blocked an attempt to grant a role higher than your own",
  PERMISSION_GRANTED: "Granted access to a resource",
  PERMISSION_REVOKED: "Revoked access to a resource",
  VIRUS_DETECTED: "An upload was blocked by the virus scan",
};

function describe(entry: AuditLogResponse): string {
  return EVENT_LABELS[entry.eventType] ?? entry.eventType;
}

export function AuditLogList({ filters }: { filters: AuditLogFilters }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<AuditLogResponse[]>([]);
  const { data, isLoading, isFetching } = useAuditLog({ ...filters, cursor });

  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No security events yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
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
            {item.ipAddress && (
              <span className="shrink-0 text-xs text-muted-foreground">{item.ipAddress}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDistanceToNow(item.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      {data?.nextCursor && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
