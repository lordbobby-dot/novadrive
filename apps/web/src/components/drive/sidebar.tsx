"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  Clock,
  HardDrive,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { useRootFolder } from "@/hooks/use-drive";
import { useCurrentUser } from "@/hooks/use-users";

const linkItems = [
  { label: "Recent", icon: Clock, href: "/drive/recent" },
  { label: "Favorites", icon: Star, href: "/drive/favorites" },
  { label: "Shared with Me", icon: Users, href: "/drive/shared" },
  { label: "Organizations", icon: Building2, href: "/drive/organizations" },
  { label: "Storage", icon: PieChart, href: "/drive/storage" },
  { label: "Trash", icon: Trash2, href: "/drive/trash" },
  { label: "Activity", icon: Activity, href: "/drive/activity" },
  { label: "Security", icon: ShieldCheck, href: "/drive/security" },
];

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const { data: root } = useRootFolder();
  const { data: me } = useCurrentUser();
  const pathname = usePathname();
  const activeFolderId = pathname.startsWith("/drive/") ? pathname.split("/")[2] : undefined;
  const isMyDriveActive = root && activeFolderId === root.id;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col gap-1 border-r border-border bg-card/50 p-3 transition-all",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <Link
        href={root ? `/drive/${root.id}` : "/drive"}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
          isMyDriveActive && "bg-muted text-foreground",
        )}
      >
        <HardDrive className="size-4 shrink-0" />
        {!collapsed && <span>My Drive</span>}
      </Link>

      {linkItems.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
            pathname.startsWith(item.href) && "bg-muted text-foreground",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      ))}

      {me?.isSystemAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ShieldAlert className="size-4 shrink-0" />
          {!collapsed && <span>Admin</span>}
        </Link>
      )}
    </aside>
  );
}
