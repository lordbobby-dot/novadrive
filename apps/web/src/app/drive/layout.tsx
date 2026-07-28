import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/drive/sidebar";
import { MobileNavTrigger } from "@/components/drive/mobile-nav-trigger";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadProgressPanel } from "@/components/drive/upload-progress-panel";
import { NotificationBell } from "@/components/drive/notification-bell";
import { SearchBar } from "@/components/search/search-bar";
import { LogoWordmark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <MobileNavTrigger />
          <LogoWordmark className="text-lg" />
        </div>
        <div className="hidden flex-1 md:block">
          <SearchBar />
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Link
            href="/drive/search"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
          <NotificationBell />
          <ThemeToggle />
          <UserButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <UploadProgressPanel />
    </div>
  );
}
