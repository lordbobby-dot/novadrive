"use client";

import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui-store";

export function ViewToggle() {
  const viewMode = useUiStore((state) => state.viewMode);
  const setViewMode = useUiStore((state) => state.setViewMode);

  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      <Button
        variant={viewMode === "grid" ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Grid view"
        aria-pressed={viewMode === "grid"}
        onClick={() => setViewMode("grid")}
      >
        <LayoutGrid className="size-4" />
      </Button>
      <Button
        variant={viewMode === "list" ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="List view"
        aria-pressed={viewMode === "list"}
        onClick={() => setViewMode("list")}
      >
        <List className="size-4" />
      </Button>
    </div>
  );
}
