"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Folder as FolderIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreadcrumb, useFolderChildren, useRootFolder } from "@/hooks/use-drive";
import {
  useCopyFile,
  useCopyFolder,
  useMoveFile,
  useMoveFolder,
} from "@/hooks/use-drive-operations";
import type { DriveEntry } from "./drive-item-card";

export function MoveCopyDialog({
  mode,
  entries,
  onOpenChange,
  onDone,
}: {
  mode: "move" | "copy";
  entries: DriveEntry[] | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { data: root } = useRootFolder();
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const { data: children, isLoading } = useFolderChildren(browseFolderId ?? undefined);
  const { data: breadcrumb } = useBreadcrumb(browseFolderId ?? undefined);

  const moveFolder = useMoveFolder();
  const copyFolder = useCopyFolder();
  const moveFile = useMoveFile();
  const copyFile = useCopyFile();
  const isBusy =
    moveFolder.isPending || copyFolder.isPending || moveFile.isPending || copyFile.isPending;

  const open = entries !== null;

  useEffect(() => {
    if (open && root) setBrowseFolderId(root.id);
  }, [open, root]);

  async function handleConfirm() {
    if (!browseFolderId || !entries) return;

    const results = await Promise.allSettled(
      entries.map((entry) => {
        if (entry.type === "folder") {
          return mode === "move"
            ? moveFolder.mutateAsync({ id: entry.data.id, targetParentId: browseFolderId })
            : copyFolder.mutateAsync({ id: entry.data.id, targetParentId: browseFolderId });
        }
        return mode === "move"
          ? moveFile.mutateAsync({ id: entry.data.id, targetFolderId: browseFolderId })
          : copyFile.mutateAsync({ id: entry.data.id, targetFolderId: browseFolderId });
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    const verb = mode === "move" ? "Moved" : "Copied";
    if (succeeded > 0) {
      toast.success(`${verb} ${succeeded} item${succeeded === 1 ? "" : "s"}`);
    }
    if (failed > 0) {
      toast.error(
        `Couldn't ${mode} ${failed} item${failed === 1 ? "" : "s"} — check it isn't a folder's own descendant`,
      );
    }

    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "move" ? "Move" : "Copy"} {entries?.length ?? 0} item
            {entries?.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
          {breadcrumb?.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 shrink-0" />}
              <button
                type="button"
                onClick={() => setBrowseFolderId(folder.id)}
                className="shrink-0 hover:text-foreground hover:underline"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : children && children.items.length > 0 ? (
            <ul className="p-1">
              {children.items.map((folder) => {
                const isBeingMoved = entries?.some(
                  (entry) => entry.type === "folder" && entry.data.id === folder.id,
                );
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      disabled={isBeingMoved}
                      onClick={() => setBrowseFolderId(folder.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                      title={isBeingMoved ? "Can't navigate into a folder you're moving" : undefined}
                    >
                      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-4 text-center text-xs text-muted-foreground">No subfolders here.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!browseFolderId || isBusy}>
            {mode === "move" ? "Move here" : "Copy here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
