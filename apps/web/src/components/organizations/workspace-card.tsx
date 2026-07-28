"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import type { WorkspaceResponse } from "@novadrive/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceRootFolder } from "@/hooks/use-organizations";

/** Every workspace has exactly one root folder, created eagerly alongside the workspace itself
 * (see CreateWorkspaceUseCase on the backend) — clicking a workspace just navigates into that
 * folder via the same `/drive/[folderId]` route personal Drive uses, so no separate org-scoped
 * browsing UI is needed. */
export function WorkspaceCard({ workspace }: { workspace: WorkspaceResponse }) {
  const { data: root, isLoading } = useWorkspaceRootFolder(workspace.id);

  return (
    <Link
      href={root ? `/drive/${root.id}` : "#"}
      aria-disabled={!root}
      className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      <Folder className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
      {isLoading && <Skeleton className="h-4 w-12" />}
    </Link>
  );
}
