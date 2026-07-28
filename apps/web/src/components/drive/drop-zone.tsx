"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { UploadCloud } from "lucide-react";
import { readDroppedItems } from "@/lib/dropped-items";
import { enqueueFilesWithFolders } from "@/lib/upload-manager";
import { toast } from "sonner";

export function DropZone({ folderId, children }: { folderId: string; children: ReactNode }) {
  const { getToken } = useAuth();
  // Counts nested enter/leave pairs so the overlay doesn't flicker when the cursor
  // crosses a child element's border while still inside the drop zone.
  const [dragDepth, setDragDepth] = useState(0);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    setDragDepth((depth) => depth + 1);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragDepth((depth) => Math.max(0, depth - 1));
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragDepth(0);
    const items = await readDroppedItems(event.dataTransfer);
    if (items.length === 0) return;
    try {
      await enqueueFilesWithFolders(items, folderId, getToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start upload");
    }
  }

  return (
    <div
      className="relative flex flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {dragDepth > 0 && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
          <UploadCloud className="size-10 text-primary" />
          <p className="text-sm font-medium text-foreground">Drop to upload</p>
        </div>
      )}
    </div>
  );
}
