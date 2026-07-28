"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useFolder } from "@/hooks/use-drive";
import { useOrganizationQuota, usePersonalQuota } from "@/hooks/use-quota";
import { cn } from "@/lib/utils";

/** Scoped to whichever quota the current folder actually draws from — a workspace folder shows
 * its organization's shared usage, a personal folder shows the caller's own. Renders nothing
 * below 80% used; the backend (QuotaService.reserve) is still the real enforcement point even
 * when this banner isn't shown or hasn't refreshed yet — this is a proactive warning, not the
 * source of truth. */
export function QuotaBanner({ folderId }: { folderId: string }) {
  const { data: folder } = useFolder(folderId);
  const personal = usePersonalQuota();
  const org = useOrganizationQuota(folder?.organizationId ?? undefined);
  const quota = folder?.organizationId ? org.data : personal.data;

  if (!quota || quota.percentUsed < 80) return null;

  const isFull = quota.percentUsed >= 100;
  const scopeLabel = folder?.organizationId ? "This organization's" : "Your";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
        isFull
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">
        {isFull
          ? `${scopeLabel} storage is full — new uploads will be rejected until space is freed.`
          : `${scopeLabel} storage is at ${quota.percentUsed}% — uploads may soon be rejected.`}
      </span>
      <Link
        href={folder?.organizationId ? `/drive/organizations` : "/drive/storage"}
        className="shrink-0 underline underline-offset-2 hover:no-underline"
      >
        Manage storage
      </Link>
    </div>
  );
}
