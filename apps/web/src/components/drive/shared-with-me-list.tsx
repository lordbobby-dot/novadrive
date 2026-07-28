"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, File as FileIcon, Folder as FolderIcon } from "lucide-react";
import type { SharedWithMeItemResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { useDownloadFile } from "@/hooks/use-drive";
import { triggerBrowserDownload } from "@/lib/download-file";

const ROLE_LABEL: Record<SharedWithMeItemResponse["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
  GUEST: "Guest",
};

/** Row rendering for GET /shared-with-me — unlike ResultList (search/recent/favorites), each row
 * also carries the granter's name and the caller's role, and a folder click navigates in while a
 * file click downloads directly (the caller may not have permission to browse the file's parent
 * folder if it was shared to them individually rather than via the folder). */
export function SharedWithMeList({ items }: { items: SharedWithMeItemResponse[] }) {
  const router = useRouter();
  const downloadFile = useDownloadFile();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(item: SharedWithMeItemResponse) {
    setDownloadingId(item.id);
    try {
      const result = await downloadFile.mutateAsync(item.id);
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error(`Couldn't download ${item.name}`);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
        >
          <button
            type="button"
            onClick={() => {
              if (item.type === "folder") router.push(`/drive/${item.id}`);
              else void handleDownload(item);
            }}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {item.type === "folder" ? (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Shared by {item.ownerName ?? "someone"}
            </span>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {ROLE_LABEL[item.role]}
            </span>
          </button>
          {item.type === "file" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Download ${item.name}`}
              disabled={downloadingId === item.id}
              onClick={() => void handleDownload(item)}
            >
              <Download className="size-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
