"use client";

import { useEffect } from "react";
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
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const closeMobileNav = useUiStore((state) => state.closeMobileNav);
  const { data: root } = useRootFolder();
  const { data: me } = useCurrentUser();
  const pathname = usePathname();
  const activeFolderId = pathname.startsWith("/drive/") ? pathname.split("/")[2] : undefined;
  const isMyDriveActive = root && activeFolderId === root.id;

  // A folder link tapped from inside the mobile drawer should close it — otherwise it stays
  // open, covering the page it just navigated to.
  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  return (
    <>
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobileNav}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col gap-1 border-r border-border bg-card p-3 transition-transform md:static md:z-auto md:translate-x-0 md:bg-card/50 md:transition-all",
          mobileNavOpen && "translate-x-0",
          collapsed ? "md:w-16" : "md:w-56",
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
    </>
  );
}
