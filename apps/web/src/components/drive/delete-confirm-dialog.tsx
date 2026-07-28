"use client";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteFile, useDeleteFolder } from "@/hooks/use-drive-operations";
import type { DriveEntry } from "./drive-item-card";

export function DeleteConfirmDialog({
  entries,
  onOpenChange,
  onDone,
}: {
  entries: DriveEntry[] | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const deleteFolder = useDeleteFolder();
  const deleteFile = useDeleteFile();
  const isBusy = deleteFolder.isPending || deleteFile.isPending;
  const hasFolder = entries?.some((entry) => entry.type === "folder") ?? false;

  async function handleConfirm() {
    if (!entries) return;
    const results = await Promise.allSettled(
      entries.map((entry) =>
        entry.type === "folder"
          ? deleteFolder.mutateAsync(entry.data.id)
          : deleteFile.mutateAsync(entry.data.id),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (succeeded > 0) {
      toast.success(`Deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`);
    }
    if (failed > 0) {
      toast.error(`Couldn't delete ${failed} item${failed === 1 ? "" : "s"}`);
    }
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={entries !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Delete {entries?.length ?? 0} item{entries?.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            {hasFolder
              ? "Deleting a folder also deletes everything inside it. Items go to Trash and can be restored later."
              : "Items go to Trash and can be restored later."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={isBusy}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
