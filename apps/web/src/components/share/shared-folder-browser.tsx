"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Download, File as FileIcon, Folder as FolderIcon } from "lucide-react";
import type {
  CursorPageSharedFileResponse,
  CursorPageSharedFolderResponse,
  SharedFileItemResponse,
  SharedFolderItemResponse,
} from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { triggerBrowserDownload } from "@/lib/download-file";

interface SharedLinkDownload {
  url: string;
  expiresAt: string;
  fileName: string;
}

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

function qs(folderId: string | undefined, password: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (folderId) params.set("folderId", folderId);
  if (password) params.set("password", password);
  if (extra) for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

interface SharedFolderBrowserProps {
  token: string;
  password: string;
  canDownload: boolean;
}

/** Rendered by ShareLinkView when a shared link points at a FOLDER — browses that folder (and
 * its descendants) via the public .../folders, .../files, and .../breadcrumb endpoints. Starts
 * with `folderId` undefined (the API defaults that to the link's own root) since the frontend
 * never learns the root folder's real id from the initial `GET /shared-links/:token` call —
 * SharedLinkAccessResponseDto deliberately excludes it, same "reveal nothing about the owner"
 * principle as everywhere else on this surface. Every subsequent navigation uses ids returned by
 * these browse endpoints instead. */
export function SharedFolderBrowser({ token, password, canDownload }: SharedFolderBrowserProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [breadcrumb, setBreadcrumb] = useState<SharedFolderItemResponse[]>([]);
  const [folders, setFolders] = useState<SharedFolderItemResponse[]>([]);
  const [foldersCursor, setFoldersCursor] = useState<string | null>(null);
  const [files, setFiles] = useState<SharedFileItemResponse[]>([]);
  const [filesCursor, setFilesCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [foldersPage, filesPage, chain] = await Promise.all([
          apiFetch<CursorPageSharedFolderResponse>(
            `/shared-links/${token}/folders${qs(currentFolderId, password)}`,
          ),
          apiFetch<CursorPageSharedFileResponse>(
            `/shared-links/${token}/files${qs(currentFolderId, password)}`,
          ),
          apiFetch<SharedFolderItemResponse[]>(
            `/shared-links/${token}/breadcrumb${qs(currentFolderId, password)}`,
          ),
        ]);
        if (cancelled) return;
        setFolders(foldersPage.items);
        setFoldersCursor(foldersPage.nextCursor);
        setFiles(filesPage.items);
        setFilesCursor(filesPage.nextCursor);
        setBreadcrumb(chain);
      } catch {
        if (!cancelled) toast.error("Couldn't load this folder");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, password, currentFolderId]);

  async function loadMoreFolders() {
    if (!foldersCursor) return;
    const page = await apiFetch<CursorPageSharedFolderResponse>(
      `/shared-links/${token}/folders${qs(currentFolderId, password, { cursor: foldersCursor })}`,
    );
    setFolders((prev) => [...prev, ...page.items]);
    setFoldersCursor(page.nextCursor);
  }

  async function loadMoreFiles() {
    if (!filesCursor) return;
    const page = await apiFetch<CursorPageSharedFileResponse>(
      `/shared-links/${token}/files${qs(currentFolderId, password, { cursor: filesCursor })}`,
    );
    setFiles((prev) => [...prev, ...page.items]);
    setFilesCursor(page.nextCursor);
  }

  async function handleDownload(file: SharedFileItemResponse) {
    setDownloadingId(file.id);
    try {
      const result = await apiFetch<SharedLinkDownload>(`/shared-links/${token}/download`, {
        method: "POST",
        body: JSON.stringify({ password: password || undefined, fileId: file.id }),
      });
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error("Couldn't download — the link may have reached its download limit.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {breadcrumb.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-3 shrink-0" />}
            {index === breadcrumb.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentFolderId(crumb.id)}
                className="hover:text-foreground hover:underline"
              >
                {crumb.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">This folder is empty.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => setCurrentFolderId(folder.id)}
                className="flex w-full items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent"
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
            </li>
          ))}
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              {canDownload && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${file.name}`}
                  disabled={downloadingId === file.id}
                  onClick={() => void handleDownload(file)}
                >
                  <Download className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(foldersCursor ?? filesCursor) && !loading && (
        <div className="flex justify-center gap-2">
          {foldersCursor && (
            <Button variant="outline" size="sm" onClick={() => void loadMoreFolders()}>
              Load more folders
            </Button>
          )}
          {filesCursor && (
            <Button variant="outline" size="sm" onClick={() => void loadMoreFiles()}>
              Load more files
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
