import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/drive/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadProgressPanel } from "@/components/drive/upload-progress-panel";
import { NotificationBell } from "@/components/drive/notification-bell";
import { SearchBar } from "@/components/search/search-bar";

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <span className="shrink-0 text-lg font-semibold tracking-tight">NovaDrive</span>
        <SearchBar />
        <div className="flex shrink-0 items-center gap-3">
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
