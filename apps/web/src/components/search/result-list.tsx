"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { File as FileIcon, Folder as FolderIcon } from "lucide-react";
import type { SearchResultItemResponse } from "@novadrive/types";
import { useFavoritedStatus } from "@/hooks/use-favorites";
import { FavoriteToggleButton } from "@/components/drive/favorite-toggle-button";

/** Shared row rendering for GET /search, /recent, and /favorites results — same item shape,
 * same "click to jump" navigation, same favorite-star affordance. */
export function ResultList({ items }: { items: SearchResultItemResponse[] }) {
  const router = useRouter();
  const fileIds = useMemo(
    () => items.filter((item) => item.type === "file").map((item) => item.id),
    [items],
  );
  const folderIds = useMemo(
    () => items.filter((item) => item.type === "folder").map((item) => item.id),
    [items],
  );
  const favoriteIds = useFavoritedStatus(fileIds, folderIds);

  function handleResultClick(item: SearchResultItemResponse) {
    const destination = item.type === "folder" ? item.id : item.parentOrFolderId;
    if (destination) router.push(`/drive/${destination}`);
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
            onClick={() => handleResultClick(item)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {item.type === "folder" ? (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            {item.contentType && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.contentType}
              </span>
            )}
          </button>
          <FavoriteToggleButton
            type={item.type}
            id={item.id}
            name={item.name}
            favorited={favoriteIds.has(`${item.type}:${item.id}`)}
          />
        </div>
      ))}
    </div>
  );
}
