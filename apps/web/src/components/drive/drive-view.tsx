"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { FileResponse } from "@novadrive/types";
import { Breadcrumbs } from "@/components/drive/breadcrumbs";
import { ViewToggle } from "@/components/drive/view-toggle";
import { NewFolderDialog } from "@/components/drive/new-folder-dialog";
import { UploadButton } from "@/components/drive/upload-button";
import { DropZone } from "@/components/drive/drop-zone";
import { DriveItemCard, type DriveEntry } from "@/components/drive/drive-item-card";
import { SelectionToolbar } from "@/components/drive/selection-toolbar";
import { MoveCopyDialog } from "@/components/drive/move-copy-dialog";
import { DeleteConfirmDialog } from "@/components/drive/delete-confirm-dialog";
import { TagEditorDialog } from "@/components/drive/tag-editor-dialog";
import { VersionHistoryDialog } from "@/components/drive/version-history-dialog";
import { ShareDialog } from "@/components/drive/share-dialog";
import { CommentPanelDialog } from "@/components/drive/comment-panel-dialog";
import { QuotaBanner } from "@/components/storage/quota-banner";
import type { PreviewTarget } from "@/components/preview/preview-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiStore } from "@/store/ui-store";
import { useFilesByFolder, useFolderChildren } from "@/hooks/use-drive";
import { useMoveFile, useMoveFolder } from "@/hooks/use-drive-operations";
import { useFavoritedStatus } from "@/hooks/use-favorites";
import type { InternalDragPayload } from "@/lib/internal-drag";

// The preview dialog pulls in react-markdown, react-syntax-highlighter, pdfjs-dist, and
// papaparse — none of that belongs in the Drive page's initial bundle, only in the async
// chunk loaded the first time someone actually opens a preview.
const PreviewDialog = dynamic(
  () => import("@/components/preview/preview-dialog").then((mod) => mod.PreviewDialog),
  { ssr: false },
);

function entryKey(entry: DriveEntry): string {
  return `${entry.type}-${entry.data.id}`;
}

export function DriveView({ folderId }: { folderId: string }) {
  const viewMode = useUiStore((state) => state.viewMode);
  const { data: children, isLoading: loadingFolders } = useFolderChildren(folderId);
  const { data: files, isLoading: loadingFiles } = useFilesByFolder(folderId);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [moveCopyState, setMoveCopyState] = useState<{
    mode: "move" | "copy";
    entries: DriveEntry[];
  } | null>(null);
  const [deleteEntries, setDeleteEntries] = useState<DriveEntry[] | null>(null);
  const [tagsEntry, setTagsEntry] = useState<DriveEntry | null>(null);
  const [historyEntry, setHistoryEntry] = useState<DriveEntry | null>(null);
  const [shareEntry, setShareEntry] = useState<DriveEntry | null>(null);
  const [commentEntry, setCommentEntry] = useState<DriveEntry | null>(null);

  const moveFolder = useMoveFolder();
  const moveFile = useMoveFile();

  const isLoading = loadingFolders || loadingFiles;
  const entries: DriveEntry[] = [
    ...(children?.items.map((folder): DriveEntry => ({ type: "folder", data: folder })) ?? []),
    ...(files?.items.map((file): DriveEntry => ({ type: "file", data: file })) ?? []),
  ];
  const selectedEntries = entries.filter((entry) => selection.has(entryKey(entry)));
  // One batched favorited-status check per folder page, not one per card — see
  // useFavoritedStatus for why (it replaced a capped-at-100 global fetch).
  const folderIds = useMemo(
    () => (children?.items ?? []).map((folder) => folder.id),
    [children],
  );
  const fileIds = useMemo(() => (files?.items ?? []).map((file) => file.id), [files]);
  const favoriteIds = useFavoritedStatus(fileIds, folderIds);

  // A fresh folder is a fresh selection context — stale highlighted rows from the previous
  // folder would otherwise linger (same Set, different entries).
  useEffect(() => {
    setSelection(new Set());
    setLastSelectedIndex(null);
  }, [folderId]);

  function clearSelection() {
    setSelection(new Set());
    setLastSelectedIndex(null);
  }

  function openPreview(file: FileResponse) {
    clearSelection();
    setPreviewTarget({ id: file.id, name: file.name, contentType: file.contentType });
  }

  function handleSelect(entry: DriveEntry, modifiers: { shift: boolean; meta: boolean }) {
    const key = entryKey(entry);
    const index = entries.findIndex((e) => entryKey(e) === key);

    if (modifiers.shift && lastSelectedIndex !== null) {
      const [start, end] = [lastSelectedIndex, index].sort((a, b) => a - b);
      const rangeKeys = entries.slice(start, end + 1).map(entryKey);
      setSelection((prev) => new Set([...prev, ...rangeKeys]));
      return;
    }

    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastSelectedIndex(index);
  }

  function handleInternalDrop(targetFolderId: string, payload: InternalDragPayload) {
    if (payload.type === "folder" && payload.id === targetFolderId) return;

    if (payload.type === "folder") {
      moveFolder.mutate(
        { id: payload.id, targetParentId: targetFolderId },
        {
          onSuccess: () => toast.success(`Moved ${payload.name}`),
          onError: () => toast.error(`Couldn't move ${payload.name}`),
        },
      );
    } else {
      moveFile.mutate(
        { id: payload.id, targetFolderId },
        {
          onSuccess: () => toast.success(`Moved ${payload.name}`),
          onError: () => toast.error(`Couldn't move ${payload.name}`),
        },
      );
    }
  }

  return (
    <DropZone folderId={folderId}>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <Breadcrumbs folderId={folderId} />
          <div className="flex items-center gap-2">
            <ViewToggle />
            <UploadButton folderId={folderId} />
            <NewFolderDialog parentId={folderId} />
          </div>
        </div>

        <QuotaBanner folderId={folderId} />

        {isLoading ? (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
                : "flex flex-col gap-1"
            }
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === "grid" ? "h-28 w-full" : "h-10 w-full"} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            This folder is empty. Create a new folder to get started, or drag files in.
          </p>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
                : "flex flex-col gap-1"
            }
          >
            {entries.map((entry) => (
              <DriveItemCard
                key={entryKey(entry)}
                entry={entry}
                layout={viewMode}
                parentId={folderId}
                onPreview={openPreview}
                selected={selection.has(entryKey(entry))}
                favorited={favoriteIds.has(`${entry.type}:${entry.data.id}`)}
                onSelect={handleSelect}
                onMove={(target) => setMoveCopyState({ mode: "move", entries: [target] })}
                onCopy={(target) => setMoveCopyState({ mode: "copy", entries: [target] })}
                onDelete={(target) => setDeleteEntries([target])}
                onManageTags={setTagsEntry}
                onViewHistory={setHistoryEntry}
                onShare={setShareEntry}
                onComment={setCommentEntry}
                onInternalDrop={handleInternalDrop}
              />
            ))}
          </div>
        )}
      </div>

      <SelectionToolbar
        count={selectedEntries.length}
        onMove={() => setMoveCopyState({ mode: "move", entries: selectedEntries })}
        onCopy={() => setMoveCopyState({ mode: "copy", entries: selectedEntries })}
        onDelete={() => setDeleteEntries(selectedEntries)}
        onClear={clearSelection}
      />

      <PreviewDialog
        target={previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null);
        }}
      />

      <MoveCopyDialog
        mode={moveCopyState?.mode ?? "move"}
        entries={moveCopyState?.entries ?? null}
        onOpenChange={(open) => {
          if (!open) setMoveCopyState(null);
        }}
        onDone={clearSelection}
      />

      <DeleteConfirmDialog
        entries={deleteEntries}
        onOpenChange={(open) => {
          if (!open) setDeleteEntries(null);
        }}
        onDone={clearSelection}
      />

      <TagEditorDialog
        entry={tagsEntry}
        onOpenChange={(open) => {
          if (!open) setTagsEntry(null);
        }}
      />

      <VersionHistoryDialog
        entry={historyEntry}
        onOpenChange={(open) => {
          if (!open) setHistoryEntry(null);
        }}
      />

      <ShareDialog
        entry={shareEntry}
        onOpenChange={(open) => {
          if (!open) setShareEntry(null);
        }}
      />

      <CommentPanelDialog
        entry={commentEntry}
        onOpenChange={(open) => {
          if (!open) setCommentEntry(null);
        }}
      />
    </DropZone>
  );
}
