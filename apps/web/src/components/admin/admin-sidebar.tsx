"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  HeartPulse,
  LineChart,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const linkItems = [
  { label: "Users", icon: Users, href: "/admin/users" },
  { label: "Organizations", icon: Building2, href: "/admin/organizations" },
  { label: "Audit Logs", icon: Activity, href: "/admin/audit-logs" },
  { label: "System Health", icon: HeartPulse, href: "/admin/system-health" },
  { label: "Analytics", icon: LineChart, href: "/admin/analytics" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const closeMobileNav = useUiStore((state) => state.closeMobileNav);

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
          "fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col gap-1 border-r border-border bg-card p-3 transition-transform md:static md:z-auto md:w-56 md:translate-x-0 md:bg-card/50",
          mobileNavOpen && "translate-x-0",
        )}
      >
        <Link
          href="/drive"
          className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Back to Drive
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
            {item.label}
          </Link>
        ))}
      </aside>
    </>
  );
}
