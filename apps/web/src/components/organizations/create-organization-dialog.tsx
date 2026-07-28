"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateOrganization } from "@/hooks/use-organizations";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
});

export function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createOrganization = useCreateOrganization();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: z.infer<typeof schema>) {
    createOrganization.mutate(values.name, {
      onSuccess: (org) => {
        setOpen(false);
        form.reset();
        router.push(`/drive/organizations/${org.id}`);
      },
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New organization
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              autoFocus
              placeholder="Acme Corp"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createOrganization.isPending}>
              {createOrganization.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
