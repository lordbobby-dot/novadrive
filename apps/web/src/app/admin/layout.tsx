import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <span className="shrink-0 text-lg font-semibold tracking-tight">
          NovaDrive Admin
        </span>
        <div className="flex shrink-0 items-center gap-3">
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
