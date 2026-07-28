"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { Download, History, RotateCcw, Upload } from "lucide-react";
import type { FileVersionResponse } from "@novadrive/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format-date";
import { useFileVersions, useRestoreFileVersion, useVersionDownloadUrl } from "@/hooks/use-versions";
import { triggerBrowserDownload } from "@/lib/download-file";
import { enqueueVersionUpload } from "@/lib/upload-manager";
import { ActivityFeedList } from "@/components/activity/activity-feed-list";
import type { DriveEntry } from "./drive-item-card";

function formatBytes(size: string): string {
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return `${size} B`;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function VersionsTab({ fileId, folderId }: { fileId: string; folderId: string }) {
  const { data: versions, isLoading } = useFileVersions(fileId);
  const restoreVersion = useRestoreFileVersion(fileId);
  const getDownloadUrl = useVersionDownloadUrl();
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownload(version: FileVersionResponse) {
    try {
      const result = await getDownloadUrl.mutateAsync({ fileId, versionNumber: version.versionNumber });
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error(`Couldn't download version ${version.versionNumber}`);
    }
  }

  async function handleRestore(version: FileVersionResponse) {
    try {
      await restoreVersion.mutateAsync(version.versionNumber);
      toast.success(`Restored version ${version.versionNumber}`);
    } catch {
      toast.error(`Couldn't restore version ${version.versionNumber}`);
    }
  }

  function handleUploadNewVersion(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    enqueueVersionUpload(crypto.randomUUID(), file, fileId, folderId, getToken);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleUploadNewVersion(e.target.files)}
      />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="size-4" />
        Upload new version
      </Button>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {versions?.map((version) => (
            <li
              key={version.id}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
                version.isCurrent && "border-primary bg-primary/5",
              )}
            >
              <span className="font-medium">v{version.versionNumber}</span>
              {version.isCurrent && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Current
                </span>
              )}
              <span className="text-xs text-muted-foreground">{formatBytes(version.size)}</span>
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {formatDistanceToNow(version.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download version ${version.versionNumber}`}
                onClick={() => void handleDownload(version)}
              >
                <Download className="size-4" />
              </Button>
              {!version.isCurrent && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Restore version ${version.versionNumber}`}
                  disabled={restoreVersion.isPending}
                  onClick={() => void handleRestore(version)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VersionHistoryDialog({
  entry,
  onOpenChange,
}: {
  entry: DriveEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"versions" | "activity">("versions");
  const file = entry?.type === "file" ? entry.data : null;

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setTab("versions");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            <History className="size-4 shrink-0" />
            {file?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("versions")}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === "versions"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground",
            )}
          >
            Versions
          </button>
          <button
            type="button"
            onClick={() => setTab("activity")}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === "activity"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground",
            )}
          >
            Activity
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {file &&
            (tab === "versions" ? (
              <VersionsTab fileId={file.id} folderId={file.folderId} />
            ) : (
              <ActivityFeedList filters={{ targetId: file.id, limit: 20 }} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
