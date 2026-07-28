"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import type { CommentResponse, ResourceType } from "@novadrive/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format-date";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useResolveComment,
} from "@/hooks/use-comments";
import type { DriveEntry } from "./drive-item-card";

function authorLabel(comment: CommentResponse): string {
  return comment.authorName ?? comment.authorEmail ?? comment.authorId;
}

function CommentRow({
  comment,
  onResolve,
  onDelete,
  busy,
}: {
  comment: CommentResponse;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2 text-sm",
        comment.resolved && "border-dashed opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{authorLabel(comment)}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(comment.createdAt)}
        </span>
        {comment.resolved && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            Resolved
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={comment.resolved ? "Mark unresolved" : "Mark resolved"}
            onClick={() => onResolve(!comment.resolved)}
            disabled={busy}
          >
            {comment.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete comment"
            onClick={onDelete}
            disabled={busy}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-foreground">{comment.body}</p>
    </li>
  );
}

export function CommentPanelDialog({
  entry,
  onOpenChange,
}: {
  entry: DriveEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const resourceType: ResourceType = entry?.type === "folder" ? "FOLDER" : "FILE";
  const resourceId = entry?.data.id;

  const { data: comments, isLoading } = useComments(resourceType, resourceId);
  const createComment = useCreateComment(resourceType, resourceId ?? "");
  const resolveComment = useResolveComment(resourceType, resourceId ?? "");
  const deleteComment = useDeleteComment(resourceType, resourceId ?? "");

  const [draft, setDraft] = useState("");

  async function handlePost() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await createComment.mutateAsync(trimmed);
      setDraft("");
    } catch {
      toast.error("Couldn't post comment");
    }
  }

  async function handleResolve(id: string, resolved: boolean) {
    try {
      await resolveComment.mutateAsync({ id, resolved });
    } catch {
      toast.error("Couldn't update comment — you may not have permission");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteComment.mutateAsync(id);
    } catch {
      toast.error("Couldn't delete comment — you may not have permission");
    }
  }

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setDraft("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            <MessageSquare className="size-4 shrink-0" />
            Comments — {entry?.data.name}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : comments?.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No comments yet. Start the conversation below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments?.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  busy={resolveComment.isPending || deleteComment.isPending}
                  onResolve={(resolved) => void handleResolve(comment.id, resolved)}
                  onDelete={() => void handleDelete(comment.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-row items-center gap-2 sm:justify-stretch">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handlePost();
              }
            }}
            placeholder="Add a comment…"
            className="flex-1"
          />
          <Button onClick={() => void handlePost()} disabled={createComment.isPending || !draft.trim()}>
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
