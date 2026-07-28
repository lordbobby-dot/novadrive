"use client";

import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";

export function StorageUsageBar({
  usedBytes,
  limitBytes,
  percentUsed,
}: {
  usedBytes: string;
  limitBytes: string;
  percentUsed: number;
}) {
  const barColor =
    percentUsed >= 95 ? "bg-destructive" : percentUsed >= 80 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatBytes(usedBytes)} of {formatBytes(limitBytes)} used ({percentUsed}%)
      </p>
    </div>
  );
}
