"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { useOrganizations } from "@/hooks/use-organizations";

export default function OrganizationsPage() {
  const { data: organizations, isLoading } = useOrganizations();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Organizations</h1>
        <CreateOrganizationDialog />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : organizations && organizations.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {organizations.map((org) => (
            <li key={org.id}>
              <Link
                href={`/drive/organizations/${org.id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted"
              >
                <Building2 className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{org.name}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {org.myRole.charAt(0) + org.myRole.slice(1).toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          You&apos;re not part of any organization yet. Create one to start sharing workspaces
          with a team.
        </p>
      )}
    </div>
  );
}
