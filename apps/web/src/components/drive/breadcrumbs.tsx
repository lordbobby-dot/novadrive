"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useBreadcrumb } from "@/hooks/use-drive";
import { Skeleton } from "@/components/ui/skeleton";

export function Breadcrumbs({ folderId }: { folderId: string }) {
  const { data: chain, isLoading } = useBreadcrumb(folderId);

  if (isLoading || !chain) {
    return <Skeleton className="h-6 w-48" />;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {chain.map((folder, index) => {
        const isLast = index === chain.length - 1;
        return (
          <span key={folder.id} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
            {isLast ? (
              <span className="font-medium text-foreground">{folder.name}</span>
            ) : (
              <Link href={`/drive/${folder.id}`} className="text-muted-foreground hover:text-foreground">
                {folder.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
