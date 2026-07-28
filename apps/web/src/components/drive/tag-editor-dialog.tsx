"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFileTags, useFolderTags, useSetFileTags, useSetFolderTags } from "@/hooks/use-tags";
import type { DriveEntry } from "./drive-item-card";

function useEntryTags(entry: DriveEntry | null) {
  const fileTags = useFileTags(entry?.type === "file" ? entry.data.id : undefined);
  const folderTags = useFolderTags(entry?.type === "folder" ? entry.data.id : undefined);
  return entry?.type === "file" ? fileTags : folderTags;
}

export function TagEditorDialog({
  entry,
  onOpenChange,
}: {
  entry: DriveEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: currentTags, isLoading } = useEntryTags(entry);
  const setFileTags = useSetFileTags(entry?.type === "file" ? entry.data.id : "");
  const setFolderTags = useSetFolderTags(entry?.type === "folder" ? entry.data.id : "");
  const [draft, setDraft] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (currentTags) setDraft(currentTags.map((tag) => tag.name));
  }, [currentTags]);

  useEffect(() => {
    if (!entry) {
      setDraft([]);
      setInput("");
    }
  }, [entry]);

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !draft.includes(trimmed)) {
      setDraft((prev) => [...prev, trimmed]);
    }
    setInput("");
  }

  function removeTag(name: string) {
    setDraft((prev) => prev.filter((tag) => tag !== name));
  }

  async function handleSave() {
    if (!entry) return;
    try {
      if (entry.type === "file") {
        await setFileTags.mutateAsync(draft);
      } else {
        await setFolderTags.mutateAsync(draft);
      }
      toast.success("Tags updated");
      onOpenChange(false);
    } catch {
      toast.error("Failed to update tags");
    }
  }

  const isBusy = setFileTags.isPending || setFolderTags.isPending;

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">Tags — {entry?.data.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {isLoading ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : draft.length === 0 ? (
            <span className="text-xs text-muted-foreground">No tags yet.</span>
          ) : (
            draft.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeTag(name)}
                  aria-label={`Remove tag ${name}`}
                  className="hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag and press Enter"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isBusy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
