"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { File as FileIcon, Folder as FolderIcon, Search } from "lucide-react";
import type { SearchResultItemResponse } from "@novadrive/types";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/use-search";

export function SearchBar() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data } = useSearch({ q: debouncedQuery, limit: 6 });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToFullResults() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/drive/search?q=${encodeURIComponent(trimmed)}`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    goToFullResults();
  }

  function handleResultClick(item: SearchResultItemResponse) {
    setOpen(false);
    setQuery("");
    const destination = item.type === "folder" ? item.id : item.parentOrFolderId;
    if (destination) router.push(`/drive/${destination}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search files and folders…"
            className="pl-8"
          />
        </div>
      </form>

      {open && debouncedQuery.trim() && (
        <div className="absolute top-full z-40 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          {!data || data.items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No results</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1">
              {data.items.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => handleResultClick(item)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {item.type === "folder" ? (
                      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={goToFullResults}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              See all results for &ldquo;{query}&rdquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
