"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminChangeMemberRole,
  useAdminOrganizationDetail,
  useAdminRemoveMember,
} from "@/hooks/use-admin";
import { formatBytes } from "@/lib/format-bytes";
import { SetOrgQuotaDialog } from "@/components/admin/set-org-quota-dialog";
import { TransferOwnershipDialog } from "@/components/admin/transfer-ownership-dialog";
import { DeleteOrganizationDialog } from "@/components/admin/delete-organization-dialog";
import type { AdminOrganizationMemberResponse, AdminOrganizationResponse, PermissionRole } from "@novadrive/types";

// OWNER excluded — ownership moves only through "Transfer ownership" above, never a plain role
// change (see AdminChangeMemberRoleUseCase on the backend).
const ADMIN_ASSIGNABLE_ROLES: PermissionRole[] = ["ADMIN", "EDITOR", "VIEWER", "GUEST"];

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function MemberRow({
  member,
  organizationId,
}: {
  member: AdminOrganizationMemberResponse;
  organizationId: string;
}) {
  const changeRole = useAdminChangeMemberRole(organizationId);
  const removeMember = useAdminRemoveMember(organizationId);
  const isOwner = member.role === "OWNER";
  const label = member.name ?? member.email ?? member.userId;

  return (
    <li className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
        {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {isOwner ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {roleLabel(member.role)}
        </span>
      ) : (
        <>
          <select
            value={member.role}
            disabled={changeRole.isPending}
            onChange={(e) =>
              changeRole.mutate(
                { userId: member.userId, role: e.target.value as PermissionRole },
                {
                  onSuccess: () => toast.success("Role updated"),
                  onError: () => toast.error("Couldn't update role"),
                },
              )
            }
            className="h-7 shrink-0 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {ADMIN_ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label}`}
            disabled={removeMember.isPending}
            onClick={() =>
              removeMember.mutate(member.userId, {
                onSuccess: () => toast.success(`Removed ${label}`),
                onError: () => toast.error("Couldn't remove member"),
              })
            }
          >
            <X className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

export default function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = useAdminOrganizationDetail(id);
  const [quotaTarget, setQuotaTarget] = useState<AdminOrganizationResponse | null>(null);
  const [transferTarget, setTransferTarget] = useState<AdminOrganizationResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminOrganizationResponse | null>(null);

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { organization, members, workspaces } = data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Link
        href="/admin/organizations"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to organizations
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="size-6 shrink-0 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">{organization.name}</h1>
            <p className="text-xs text-muted-foreground">
              {organization.memberCount} member{organization.memberCount === 1 ? "" : "s"} ·{" "}
              {organization.workspaceCount} workspace{organization.workspaceCount === 1 ? "" : "s"}{" "}
              · Created {new Date(organization.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setQuotaTarget(organization)}>
            Set quota
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferTarget(organization)}>
            Transfer ownership
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(organization)}>
            Delete
          </Button>
        </div>
      </div>

      <section className="max-w-md rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Storage</h2>
        <p className="text-sm">
          {formatBytes(organization.storageUsedBytes)}
          {organization.storageLimitBytes ? ` / ${formatBytes(organization.storageLimitBytes)}` : (
            <span className="text-muted-foreground"> / default limit (no override)</span>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        {members.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No members.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} organizationId={id} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Workspaces</h2>
        {workspaces.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No workspaces.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <li
                key={workspace.id}
                className="rounded-lg border border-border p-3 text-sm font-medium"
              >
                {workspace.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SetOrgQuotaDialog organization={quotaTarget} onOpenChange={(open) => !open && setQuotaTarget(null)} />
      <TransferOwnershipDialog
        organization={transferTarget}
        members={members}
        onOpenChange={(open) => !open && setTransferTarget(null)}
      />
      <DeleteOrganizationDialog
        organization={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
