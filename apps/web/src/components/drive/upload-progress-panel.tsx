"use client";

import { useMemo, useState } from "react";
import { Pause, Play, X, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadStore, type UploadItemStatus } from "@/store/upload-store";
import { pauseUpload, resumeUpload, cancelUpload, isLocallyTracked } from "@/lib/upload-manager";
import { useUploadRealtimeSync } from "@/hooks/use-upload-realtime-sync";
import { cn } from "@/lib/utils";

const DISMISSIBLE: UploadItemStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "quarantined",
];

function statusLabel(status: UploadItemStatus): string {
  switch (status) {
    case "queued":
      return "Waiting…";
    case "uploading":
      return "Uploading…";
    case "paused":
      return "Paused";
    case "completing":
      return "Verifying…";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "interrupted":
      return "Interrupted";
    case "quarantined":
      return "Blocked";
  }
}

export function UploadProgressPanel() {
  useUploadRealtimeSync();
  const items = useUploadStore((state) => state.items);
  const clearFinished = useUploadStore((state) => state.clearFinished);
  const remove = useUploadStore((state) => state.remove);
  const [collapsed, setCollapsed] = useState(false);

  const list = useMemo(() => Object.values(items).sort((a, b) => a.name.localeCompare(b.name)), [items]);

  if (list.length === 0) return null;

  const activeCount = list.filter((item) =>
    ["queued", "uploading", "completing"].includes(item.status),
  ).length;

  return (
    <div className="fixed right-4 bottom-4 z-40 w-80 rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium">
          {activeCount > 0 ? `Uploading ${activeCount} item${activeCount === 1 ? "" : "s"}` : "Uploads"}
        </p>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => clearFinished()}>
            Clear finished
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <ul className="max-h-80 overflow-y-auto p-2">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        item.status === "failed" || item.status === "quarantined"
                          ? "bg-destructive"
                          : "bg-primary",
                      )}
                      style={{ width: `${item.status === "completed" ? 100 : item.progress}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {statusLabel(item.status)}
                  </span>
                </div>
                {item.error && <p className="mt-0.5 text-xs text-destructive">{item.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {/* Another tab's upload, mirrored in via realtime sync — nothing here to
                    pause/resume/cancel, since this tab has no active transfer for it. */}
                {isLocallyTracked(item.id) && (
                  <>
                    {item.status === "uploading" && (
                      <Button size="icon-xs" variant="ghost" onClick={() => pauseUpload(item.id)}>
                        <Pause className="size-3.5" />
                      </Button>
                    )}
                    {item.status === "paused" && (
                      <Button size="icon-xs" variant="ghost" onClick={() => resumeUpload(item.id)}>
                        <Play className="size-3.5" />
                      </Button>
                    )}
                    {(item.status === "uploading" || item.status === "queued" || item.status === "paused") && (
                      <Button size="icon-xs" variant="ghost" onClick={() => void cancelUpload(item.id)}>
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </>
                )}
                {DISMISSIBLE.includes(item.status) && (
                  <Button size="icon-xs" variant="ghost" onClick={() => remove(item.id)}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
