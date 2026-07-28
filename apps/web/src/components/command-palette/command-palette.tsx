"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import {
  Activity,
  Building2,
  Clock,
  File as FileIcon,
  Folder as FolderIcon,
  FolderPlus,
  HardDrive,
  Keyboard,
  Moon,
  PieChart,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import { useCommandPaletteStore } from "@/store/command-palette-store";
import { useSearch } from "@/hooks/use-search";
import { useCreateFolder } from "@/hooks/use-drive";
import { enqueueUpload } from "@/lib/upload-manager";
import { toast } from "sonner";

const STATIC_ROUTE_SEGMENTS = new Set([
  "organizations",
  "storage",
  "trash",
  "activity",
  "security",
  "search",
  "recent",
  "favorites",
]);

interface NavAction {
  id: string;
  label: string;
  icon: typeof HardDrive;
  keywords: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useCommandPaletteStore((state) => state.open);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const setShortcutsOpen = useCommandPaletteStore((state) => state.setShortcutsOpen);
  const router = useRouter();
  const pathname = usePathname();
  const { getToken } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const createFolder = useCreateFolder(currentFolderId(pathname) ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: searchData } = useSearch({ q: debouncedQuery, limit: 8 });

  const folderId = currentFolderId(pathname);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const navActions: NavAction[] = useMemo(
    () => [
      { id: "drive", label: "My Drive", icon: HardDrive, keywords: "home root", run: () => go("/drive") },
      { id: "recent", label: "Recent", icon: Clock, keywords: "recently opened", run: () => go("/drive/recent") },
      { id: "favorites", label: "Favorites", icon: Star, keywords: "starred", run: () => go("/drive/favorites") },
      {
        id: "organizations",
        label: "Organizations",
        icon: Building2,
        keywords: "orgs workspaces teams",
        run: () => go("/drive/organizations"),
      },
      { id: "storage", label: "Storage", icon: PieChart, keywords: "quota usage", run: () => go("/drive/storage") },
      { id: "trash", label: "Trash", icon: Trash2, keywords: "deleted", run: () => go("/drive/trash") },
      { id: "activity", label: "Activity", icon: Activity, keywords: "history log", run: () => go("/drive/activity") },
      {
        id: "security",
        label: "Security",
        icon: ShieldCheck,
        keywords: "audit log sessions",
        run: () => go("/drive/security"),
      },
    ],
    [go],
  );

  const quickActions: NavAction[] = useMemo(() => {
    const actions: NavAction[] = [];
    if (folderId) {
      actions.push({
        id: "new-folder",
        label: "New folder",
        icon: FolderPlus,
        keywords: "create folder mkdir",
        run: () => {
          close();
          createFolder.mutate("Untitled Folder", {
            onSuccess: () => toast.success("Folder created"),
            onError: () => toast.error("Failed to create folder"),
          });
        },
      });
      actions.push({
        id: "upload",
        label: "Upload files",
        icon: UploadIcon,
        keywords: "add file",
        run: () => {
          close();
          fileInputRef.current?.click();
        },
      });
    }
    actions.push({
      id: "toggle-theme",
      label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: resolvedTheme === "dark" ? Sun : Moon,
      keywords: "theme dark light appearance",
      run: () => {
        close();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      },
    });
    actions.push({
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: Keyboard,
      keywords: "help hotkeys",
      run: () => {
        setOpen(false);
        setShortcutsOpen(true);
      },
    });
    return actions;
  }, [folderId, resolvedTheme, createFolder, setTheme, setShortcutsOpen, setOpen, close]);

  const filteredNav = filterActions(navActions, query);
  const filteredQuick = filterActions(quickActions, query);

  function handleUploadInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !folderId) return;
    for (const file of Array.from(files)) {
      enqueueUpload(crypto.randomUUID(), file, folderId, getToken);
    }
    e.target.value = "";
  }

  function handleResultSelect(item: NonNullable<typeof searchData>["items"][number]) {
    close();
    const destination = item.type === "folder" ? item.id : item.parentOrFolderId;
    if (destination) router.push(`/drive/${destination}`);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUploadInputChange}
      />
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        shouldFilter={false}
        label="Command palette"
        overlayClassName="fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
        contentClassName="fixed top-24 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-lg"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search files and folders, or run a command…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-96 overflow-y-auto p-1">
          <Command.Empty className="p-4 text-center text-sm text-muted-foreground">
            No matches.
          </Command.Empty>

          {debouncedQuery.trim() && searchData && searchData.items.length > 0 && (
            <Command.Group
              heading="Files & folders"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-items]]:mt-1"
            >
              {searchData.items.map((item) => (
                <Command.Item
                  key={`${item.type}-${item.id}`}
                  value={`result-${item.type}-${item.id}`}
                  onSelect={() => handleResultSelect(item)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  {item.type === "folder" ? (
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{item.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {filteredNav.length > 0 && (
            <Command.Group
              heading="Go to"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-items]]:mt-1"
            >
              {filteredNav.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.id}
                  onSelect={action.run}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <action.icon className="size-4 shrink-0 text-muted-foreground" />
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {filteredQuick.length > 0 && (
            <Command.Group
              heading="Actions"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-items]]:mt-1"
            >
              {filteredQuick.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.id}
                  onSelect={action.run}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <action.icon className="size-4 shrink-0 text-muted-foreground" />
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  );
}

/** A folder page is /drive/[id] where id isn't one of the known static section routes
 * (organizations, trash, search, …) — those are excluded so New Folder/Upload don't show up
 * while browsing Storage or Trash, where there's no "current folder" to act on. */
function currentFolderId(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "drive" || segments.length < 2) return undefined;
  const candidate = segments[1];
  if (STATIC_ROUTE_SEGMENTS.has(candidate)) return undefined;
  return candidate;
}

function filterActions(actions: NavAction[], query: string): NavAction[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return actions;
  return actions.filter(
    (action) =>
      action.label.toLowerCase().includes(trimmed) || action.keywords.includes(trimmed),
  );
}
