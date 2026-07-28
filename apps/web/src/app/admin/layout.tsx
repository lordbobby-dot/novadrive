import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { MobileNavTrigger } from "@/components/drive/mobile-nav-trigger";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoWordmark } from "@/components/logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 sm:gap-4 sm:px-6">
        <span className="flex min-w-0 shrink items-center gap-1 text-lg sm:gap-2">
          <MobileNavTrigger />
          <LogoWordmark />
          <span className="hidden text-muted-foreground sm:inline">Admin</span>
        </span>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">
          <AdminRouteGuard>{children}</AdminRouteGuard>
        </main>
      </div>
    </div>
  );
}
