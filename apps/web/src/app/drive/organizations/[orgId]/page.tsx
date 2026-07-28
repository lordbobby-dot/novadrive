"use client";

import { use } from "react";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization, useWorkspaces } from "@/hooks/use-organizations";
import { useOrganizationQuota } from "@/hooks/use-quota";
import { CreateWorkspaceDialog } from "@/components/organizations/create-workspace-dialog";
import { WorkspaceCard } from "@/components/organizations/workspace-card";
import { OrganizationMembersPanel } from "@/components/organizations/organization-members-panel";
import { StorageUsageBar } from "@/components/storage/storage-usage-bar";

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const { data: org, isLoading: loadingOrg } = useOrganization(orgId);
  const { data: workspaces, isLoading: loadingWorkspaces } = useWorkspaces(orgId);
  const { data: quota } = useOrganizationQuota(orgId);
  const canManage = org?.myRole === "OWNER" || org?.myRole === "ADMIN";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Building2 className="size-6 shrink-0 text-muted-foreground" />
        {loadingOrg || !org ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div>
            <h1 className="text-lg font-medium">{org.name}</h1>
            <p className="text-xs text-muted-foreground">
              Your role: {org.myRole.charAt(0) + org.myRole.slice(1).toLowerCase()}
            </p>
          </div>
        )}
      </div>

      {quota && (
        <section className="max-w-md">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Storage</h2>
          <StorageUsageBar
            usedBytes={quota.usedBytes}
            limitBytes={quota.limitBytes}
            percentUsed={quota.percentUsed}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Workspaces</h2>
          {canManage && <CreateWorkspaceDialog organizationId={orgId} />}
        </div>
        {loadingWorkspaces ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : workspaces && workspaces.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No workspaces yet.{canManage ? " Create one to start sharing files." : ""}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        <OrganizationMembersPanel organizationId={orgId} canManage={canManage} />
      </section>
    </div>
  );
}
