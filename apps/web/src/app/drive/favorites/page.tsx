"use client";

import { useState } from "react";
import type { SearchResultItemResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavorites } from "@/hooks/use-favorites";
import { ResultList } from "@/components/search/result-list";

export default function FavoritesPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<SearchResultItemResponse[]>([]);

  const { data, isLoading, isFetching } = useFavorites({ cursor, limit: 20 });
  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Favorites</h1>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Star a file or folder to find it here.
        </p>
      ) : (
        <ResultList items={items} />
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
