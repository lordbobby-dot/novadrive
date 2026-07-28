"use client";

import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersonalQuota } from "@/hooks/use-quota";
import { StorageUsageBar } from "@/components/storage/storage-usage-bar";
import { StorageBreakdownDonut } from "@/components/storage/storage-breakdown-donut";

export default function StoragePage() {
  const { data: quota, isLoading } = usePersonalQuota();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <HardDrive className="size-6 shrink-0 text-muted-foreground" />
        <h1 className="text-lg font-medium">Storage</h1>
      </div>

      {isLoading || !quota ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-32 w-full max-w-md" />
        </div>
      ) : (
        <>
          <div className="max-w-md">
            <StorageUsageBar
              usedBytes={quota.usedBytes}
              limitBytes={quota.limitBytes}
              percentUsed={quota.percentUsed}
            />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">By file type</h2>
            <StorageBreakdownDonut breakdown={quota.breakdown} />
          </section>
        </>
      )}
    </div>
  );
}
