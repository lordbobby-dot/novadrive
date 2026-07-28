"use client";

import { useEffect } from "react";
import { useCommandPaletteStore } from "@/store/command-palette-store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** Mounted once at the app root (see providers.tsx) — makes ⌘K/Ctrl+K and "?" work from any
 * page, not just while some particular component happens to be focused. */
export function GlobalShortcuts() {
  const toggleCommandPalette = useCommandPaletteStore((state) => state.toggle);
  const setCommandPaletteOpen = useCommandPaletteStore((state) => state.setOpen);
  const setShortcutsOpen = useCommandPaletteStore((state) => state.setShortcutsOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setCommandPaletteOpen(false);
        setShortcutsOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleCommandPalette, setCommandPaletteOpen, setShortcutsOpen]);

  return null;
}
