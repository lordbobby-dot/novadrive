"use client";

import { useState, type DragEvent, type MouseEvent } from "react";
import Link from "next/link";
import type { FileResponse, FolderResponse } from "@novadrive/types";
import { Eye, File as FileIcon, Folder as FolderIcon, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDownloadFile, useRenameFolder } from "@/hooks/use-drive";
import { FavoriteToggleButton } from "@/components/drive/favorite-toggle-button";
import { triggerBrowserDownload } from "@/lib/download-file";
import {
  isInternalDrag,
  readInternalDragData,
  setInternalDragData,
  type InternalDragPayload,
} from "@/lib/internal-drag";

export type DriveEntry =
  | { type: "folder"; data: FolderResponse }
  | { type: "file"; data: FileResponse };

export function DriveItemCard({
  entry,
  layout,
  parentId,
  onPreview,
  selected,
  favorited,
  onSelect,
  onMove,
  onCopy,
  onDelete,
  onManageTags,
  onViewHistory,
  onShare,
  onComment,
  onInternalDrop,
}: {
  entry: DriveEntry;
  layout: "grid" | "list";
  parentId: string;
  onPreview: (file: FileResponse) => void;
  selected: boolean;
  /** Resolved by the parent (DriveView), which batches one favorited-status check across every
   * entry on the current page — see useFavoritedStatus for why this isn't fetched per-card. */
  favorited: boolean;
  onSelect: (entry: DriveEntry, modifiers: { shift: boolean; meta: boolean }) => void;
  onMove: (entry: DriveEntry) => void;
  onCopy: (entry: DriveEntry) => void;
  onDelete: (entry: DriveEntry) => void;
  onManageTags: (entry: DriveEntry) => void;
  onViewHistory: (entry: DriveEntry) => void;
  onShare: (entry: DriveEntry) => void;
  onComment: (entry: DriveEntry) => void;
  onInternalDrop: (targetFolderId: string, payload: InternalDragPayload) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(entry.data.name);
  const [dragOver, setDragOver] = useState(false);
  const renameFolder = useRenameFolder(entry.data.id, parentId);
  const downloadFile = useDownloadFile();

  const isFolder = entry.type === "folder";
  const Icon = isFolder ? FolderIcon : FileIcon;

  function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === entry.data.name) {
      setRenaming(false);
      setDraftName(entry.data.name);
      return;
    }
    if (isFolder) {
      renameFolder.mutate(trimmed, { onSettled: () => setRenaming(false) });
    } else {
      // File renaming lands with the upload pipeline's file management (Milestone 3+).
      setRenaming(false);
    }
  }

  async function handleDownload() {
    try {
      const result = await downloadFile.mutateAsync(entry.data.id);
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error(`Failed to download ${entry.data.name}`);
    }
  }

  function handleClick(e: MouseEvent) {
    if (renaming) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      onSelect(entry, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
      return;
    }
    if (!isFolder) {
      onPreview(entry.data as FileResponse);
    }
    // Folders fall through to the enclosing <Link>'s normal navigation.
  }

  function handleDragStart(e: DragEvent) {
    setInternalDragData(e.dataTransfer, { type: entry.type, id: entry.data.id, name: entry.data.name });
  }

  function handleDragOver(e: DragEvent) {
    if (!isFolder || !isInternalDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const payload = readInternalDragData(e.dataTransfer);
    if (payload) onInternalDrop(entry.data.id, payload);
  }

  const nameNode = renaming ? (
    <Input
      autoFocus
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") {
          setDraftName(entry.data.name);
          setRenaming(false);
        }
      }}
      className="h-7 text-sm"
    />
  ) : (
    <span className="truncate text-sm">{entry.data.name}</span>
  );

  const menu = (
    // Stops the click from bubbling to the enclosing folder <Link> or file preview trigger —
    // otherwise opening the menu (or clicking an item in it) also navigates/opens the preview.
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="contents"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${entry.data.name}`} />
          }
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {!isFolder && (
            <DropdownMenuItem onClick={() => onPreview(entry.data as FileResponse)}>
              Preview
            </DropdownMenuItem>
          )}
          {!isFolder && (
            <DropdownMenuItem onClick={() => void handleDownload()} disabled={downloadFile.isPending}>
              Download
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMove(entry)}>Move to…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopy(entry)}>Copy to…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onManageTags(entry)}>Tags…</DropdownMenuItem>
          {!isFolder && (
            <DropdownMenuItem onClick={() => onViewHistory(entry)}>History…</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onShare(entry)}>Share…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onComment(entry)}>Comments…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(entry)} variant="destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const selectionClass = selected
    ? "border-primary bg-primary/10"
    : dragOver
      ? "border-primary bg-primary/5"
      : "border-transparent";

  if (layout === "list") {
    const row = (
      <div
        draggable={!renaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted",
          selectionClass,
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">{nameNode}</div>
        {!isFolder && (
          <>
            <Eye className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
            <span className="text-xs text-muted-foreground">{entry.data.contentType}</span>
          </>
        )}
        <FavoriteToggleButton
          type={entry.type}
          id={entry.data.id}
          name={entry.data.name}
          favorited={favorited}
        />
        {menu}
      </div>
    );
    if (isFolder && !renaming) {
      return (
        <Link href={`/drive/${entry.data.id}`} onClick={handleClick} className="group">
          {row}
        </Link>
      );
    }
    return (
      <div role="button" tabIndex={0} onClick={handleClick} className="group cursor-pointer">
        {row}
      </div>
    );
  }

  const card = (
    <div
      draggable={!renaming}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-muted",
        selectionClass,
      )}
    >
      <div className="flex w-full items-center justify-between">
        <FavoriteToggleButton
          type={entry.type}
          id={entry.data.id}
          name={entry.data.name}
          favorited={favorited}
        />
        {menu}
      </div>
      <Icon className="size-10 text-muted-foreground" />
      <div className="w-full text-center">{nameNode}</div>
    </div>
  );

  if (isFolder && !renaming) {
    return (
      <Link href={`/drive/${entry.data.id}`} onClick={handleClick}>
        {card}
      </Link>
    );
  }
  return (
    <div role="button" tabIndex={0} onClick={handleClick} className="cursor-pointer">
      {card}
    </div>
  );
}
