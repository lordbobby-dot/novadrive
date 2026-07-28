"use client";

import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToggleFavorite } from "@/hooks/use-favorites";

export function FavoriteToggleButton({
  type,
  id,
  name,
  favorited,
}: {
  type: "file" | "folder";
  id: string;
  name: string;
  favorited: boolean;
}) {
  const toggleFavorite = useToggleFavorite();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={favorited ? `Unfavorite ${name}` : `Favorite ${name}`}
      aria-pressed={favorited}
      disabled={toggleFavorite.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite.mutate(
          { type, id, favorited: !favorited },
          {
            onError: () =>
              toast.error(`Failed to ${favorited ? "unfavorite" : "favorite"} ${name}`),
          },
        );
      }}
    >
      <Star
        className={cn(
          "size-4",
          favorited ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
