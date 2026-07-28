"use client";

import { useState } from "react";
import { toast } from "sonner";
import { File as FileIcon, Folder as FolderIcon, RotateCcw, Trash2 } from "lucide-react";
import type { TrashItemResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrash, useRestoreFile, useRestoreFolder, usePermanentDelete } from "@/hooks/use-trash";

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysRemaining(deletedAt: string): number {
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, RETENTION_DAYS - Math.floor(elapsed / MS_PER_DAY));
}

export default function TrashPage() {
  const { data, isLoading } = useTrash();
  const restoreFile = useRestoreFile();
  const restoreFolder = useRestoreFolder();
  const permanentDelete = usePermanentDelete();
  const [deleteTarget, setDeleteTarget] = useState<TrashItemResponse | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);

  const items = data?.items ?? [];

  async function handleRestore(item: TrashItemResponse) {
    try {
      if (item.type === "folder") {
        await restoreFolder.mutateAsync(item.id);
      } else {
        await restoreFile.mutateAsync(item.id);
      }
      toast.success(`Restored ${item.name}`);
    } catch {
      toast.error(`Couldn't restore ${item.name}`);
    }
  }

  async function handlePermanentDelete(item: TrashItemResponse) {
    try {
      await permanentDelete.mutateAsync(item.trashId);
      toast.success(`Permanently deleted ${item.name}`);
    } catch {
      toast.error(`Couldn't delete ${item.name}`);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleEmptyTrash() {
    const results = await Promise.allSettled(
      items.map((item) => permanentDelete.mutateAsync(item.trashId)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (succeeded > 0) toast.success(`Permanently deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`Couldn't delete ${failed} item${failed === 1 ? "" : "s"}`);
    setEmptyTrashOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            Items are permanently deleted after {RETENTION_DAYS} days.
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="outline" onClick={() => setEmptyTrashOpen(true)}>
            Empty Trash
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Trash is empty.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const remaining = daysRemaining(item.deletedAt);
            return (
              <div
                key={item.trashId}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                {item.type === "folder" ? (
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {remaining === 0 ? "Deleting soon" : `${remaining} day${remaining === 1 ? "" : "s"} left`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Restore ${item.name}`}
                  onClick={() => void handleRestore(item)}
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Permanently delete ${item.name}`}
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo; forever?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={permanentDelete.isPending}
              onClick={() => deleteTarget && void handlePermanentDelete(deleteTarget)}
            >
              Delete Forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Empty Trash?</DialogTitle>
            <DialogDescription>
              Permanently deletes all {items.length} item{items.length === 1 ? "" : "s"} in Trash. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyTrashOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={permanentDelete.isPending}
              onClick={() => void handleEmptyTrash()}
            >
              Empty Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
