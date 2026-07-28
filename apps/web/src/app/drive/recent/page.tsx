"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useRecent } from "@/hooks/use-recent";
import { ResultList } from "@/components/search/result-list";

export default function RecentPage() {
  const { data, isLoading } = useRecent({ limit: 50 });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Recent</h1>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Files you open (download or preview) will show up here.
        </p>
      ) : (
        <ResultList items={data.items} />
      )}
    </div>
  );
}
