"use client";

import { formatDistanceToNow } from "@/lib/format-date";
import type { ActivityResponse } from "@novadrive/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useActivity, type ActivityFilters } from "@/hooks/use-activity";
import { useState } from "react";

const ACTION_LABELS: Record<string, string> = {
  UPLOAD: "uploaded",
  DOWNLOAD: "downloaded",
  DELETE: "deleted",
  RESTORE: "restored",
  RENAME: "renamed",
  MOVE: "moved",
  COPY: "copied",
  SHARE: "shared",
  LOGIN: "logged in",
  LOGOUT: "logged out",
  PERMISSION_CHANGE: "changed permissions on",
  VERSION_RESTORE: "restored a version of",
};

function describe(item: ActivityResponse): string {
  const verb = ACTION_LABELS[item.action] ?? item.action.toLowerCase();
  const name = (item.metadata?.name as string | undefined) ?? item.targetType.toLowerCase();
  if (item.action === "MOVE" && item.metadata) {
    return `Moved "${name}"`;
  }
  if (item.action === "RENAME" && item.metadata) {
    const oldName = item.metadata.oldName as string | undefined;
    const newName = item.metadata.newName as string | undefined;
    return oldName && newName ? `Renamed "${oldName}" to "${newName}"` : `Renamed "${name}"`;
  }
  if (item.action === "VERSION_RESTORE" && item.metadata) {
    const versionNumber = item.metadata.restoredVersionNumber as number | undefined;
    return `Restored version ${versionNumber ?? "?"} of "${name}"`;
  }
  return `${verb.charAt(0).toUpperCase() + verb.slice(1)} "${name}"`;
}

export function ActivityFeedList({ filters }: { filters: ActivityFilters }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<ActivityResponse[]>([]);
  const { data, isLoading, isFetching } = useActivity({ ...filters, cursor });

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
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm">
            <span className="flex-1 truncate">{describe(item)}</span>
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
