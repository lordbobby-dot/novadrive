"use client";

import { CloudCog } from "lucide-react";
import { useHealthCheck } from "@/hooks/use-health-check";

export function SiteFooter() {
  const { data, isLoading, isError } = useHealthCheck();
  const isUp = !isLoading && !isError && data?.status === "ok";

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudCog className="size-4" aria-hidden />
          <span>&copy; {new Date().getFullYear()} NovaDrive.</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${
              isLoading ? "bg-muted-foreground/50" : isUp ? "bg-chart-2" : "bg-destructive"
            }`}
            aria-hidden
          />
          {isLoading ? "Checking status…" : isUp ? "All systems operational" : "Service disruption"}
        </div>
      </div>
    </footer>
  );
}
