# Command Palette & Keyboard Shortcuts

Milestone 12 adds a global command palette (`⌘K` / `Ctrl+K`) and a small set of app-wide keyboard
shortcuts, built on [`cmdk`](https://cmdk.paco.me/).

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Open the command palette (works from any page) |
| `?` | Show the keyboard-shortcuts list (only when not typing in a text field) |
| `↑` / `↓` | Move through command palette results |
| `Enter` | Run the selected command / jump to the selected item |
| `Esc` | Close the command palette or the shortcuts dialog |

`GlobalShortcuts` (`components/command-palette/global-shortcuts.tsx`) is mounted once at the app
root (`app/providers.tsx`), not per-page — a single `document`-level `keydown` listener, so the
shortcuts work identically whether you're on `/drive`, `/drive/search`, or any other route. It
ignores `?` while an `<input>`/`<textarea>`/`contenteditable` element is focused (so typing a
literal question mark into, say, a rename field doesn't pop the shortcuts dialog), but `⌘K` always
fires regardless of focus, matching the convention most command-palette-driven apps use.

## Command palette

`CommandPalette` (`components/command-palette/command-palette.tsx`) is a single global component,
mounted once, with its open/closed state in a small Zustand store
(`store/command-palette-store.ts`) rather than local component state — so `GlobalShortcuts` (which
has no natural parent-child relationship with the palette) can toggle it.

It's built on cmdk's bare `Command`/`Command.Dialog` primitives directly (not wrapped in this app's
own `Dialog` component from `components/ui/dialog.tsx`) — `Command.Dialog` already renders its own
Radix Dialog internally (overlay, focus trap, `Esc`-to-close), and wrapping it a second time in this
app's own `@base-ui/react`-backed Dialog would mean two independent dialog systems fighting over the
same overlay/focus/escape behavior. `shouldFilter={false}` is set so cmdk's built-in fuzzy matcher
never touches the live search results group (which already arrives pre-ranked from the backend) —
filtering of the static nav/action items is done by hand instead (`filterActions`), a simple
case-insensitive substring match against each item's label and a short keyword string.

Three groups appear, in this order:

1. **Files & folders** — only once the typed query is non-empty, using the exact same
   `useSearch()` hook (and therefore the exact same backend `GET /search`) the full search page
   uses, debounced 200ms. Selecting a result navigates straight to it, same behavior as
   `SearchBar`'s inline dropdown.
2. **Go to** — the eight `/drive/*` sections (My Drive, Recent, Favorites, Organizations, Storage,
   Trash, Activity, Security).
3. **Actions** — context-sensitive:
   - **New folder** / **Upload files** only appear while viewing an actual folder page
     (`/drive/[folderId]`, excluding the known static section routes like `/drive/trash`) — there's
     no "current folder" to act on anywhere else, so showing them elsewhere would either silently
     do nothing useful or need to prompt for a destination, which defeats the point of a quick
     action. "New folder" creates immediately with the name "Untitled Folder" (matching Google
     Drive/Dropbox's own palette convention of create-then-rename, rather than opening a second
     prompt dialog inside the palette); "Upload files" clicks a hidden `<input type="file">` that
     stays mounted regardless of the palette's open state, so it survives the palette closing
     itself before the OS file picker opens.
   - **Switch to light/dark theme** — calls `next-themes`' `setTheme` directly; the palette needs
     no new state for this since theme already lives in `next-themes`' own context.
   - **Keyboard shortcuts** — opens the shortcuts dialog described above.

### Why "New folder"/"Upload" aren't reachable from every page

Both actions need a destination folder id. The command palette resolves "am I currently looking at
a folder" from the URL alone (`currentFolderId()` in `command-palette.tsx`) rather than tracking
"last visited folder" in global state — simpler, and it means the actions' availability always
matches what's visibly on screen (no surprising "upload succeeded, but to which folder?" outcome
from a stale reference).

## Favorites, Recent, and Shared with Me are real navigation targets now

Before this milestone, "Recent", "Favorites", and "Shared with Me" were disabled placeholder
entries in the sidebar (`title="Coming in a later milestone"`). They're now real links to
`/drive/recent`, `/drive/favorites`, and `/drive/shared` — see
[docs/permissions.md](permissions.md#shared-with-me) for what "Shared with Me" actually shows.
