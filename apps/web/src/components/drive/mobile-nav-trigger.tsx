"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui-store";

/** Hamburger button that opens the mobile drawer version of <Sidebar> — hidden at the `md`
 * breakpoint and up, where the sidebar renders statically instead. */
export function MobileNavTrigger() {
  const toggleMobileNav = useUiStore((state) => state.toggleMobileNav);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 md:hidden"
      onClick={toggleMobileNav}
      aria-label="Toggle navigation menu"
    >
      <Menu className="size-5" />
    </Button>
  );
}
