"use client";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSuspendUser } from "@/hooks/use-admin";
import type { AdminUserResponse } from "@novadrive/types";

export function SuspendUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const suspendUser = useSuspendUser();

  function handleConfirm() {
    if (!user) return;
    suspendUser.mutate(user.id, {
      onSuccess: () => {
        toast.success(`Suspended ${user.email}`);
        onOpenChange(false);
      },
      onError: () => toast.error(`Failed to suspend ${user.email}`),
    });
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Suspend {user?.email}?</DialogTitle>
          <DialogDescription>
            This immediately bans their account in Clerk (ending every active session) and blocks
            further sign-in. They can be unsuspended at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={suspendUser.isPending}
          >
            Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
