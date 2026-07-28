"use client";

import { Copy, FolderInput, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SelectionToolbar({
  count,
  onMove,
  onCopy,
  onDelete,
  onClear,
}: {
  count: number;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">
        {count} item{count === 1 ? "" : "s"} selected
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onMove}>
          <FolderInput className="size-4" />
          Move
        </Button>
        <Button size="sm" variant="ghost" onClick={onCopy}>
          <Copy className="size-4" />
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
