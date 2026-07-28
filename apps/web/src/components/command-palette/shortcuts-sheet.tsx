"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCommandPaletteStore } from "@/store/command-palette-store";

const shortcuts: { keys: string; description: string }[] = [
  { keys: "⌘ K", description: "Open the command palette" },
  { keys: "?", description: "Show this shortcuts list" },
  { keys: "↑ ↓", description: "Move through command palette results" },
  { keys: "↵", description: "Run the selected command / jump to the selected item" },
  { keys: "Esc", description: "Close the command palette or this dialog" },
];

export function ShortcutsSheet() {
  const open = useCommandPaletteStore((state) => state.shortcutsOpen);
  const setOpen = useCommandPaletteStore((state) => state.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
