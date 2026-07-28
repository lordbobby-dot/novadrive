"use client";

import { useState } from "react";
import type { SharedWithMeItemResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSharedWithMe } from "@/hooks/use-shared-with-me";
import { SharedWithMeList } from "@/components/drive/shared-with-me-list";

export default function SharedWithMePage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<SharedWithMeItemResponse[]>([]);

  const { data, isLoading, isFetching } = useSharedWithMe({ cursor, limit: 20 });
  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Shared with Me</h1>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing has been shared with you yet.
        </p>
      ) : (
        <SharedWithMeList items={items} />
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
