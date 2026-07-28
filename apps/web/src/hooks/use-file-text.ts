"use client";

import { useQuery } from "@tanstack/react-query";

/** Fetches a signed preview URL's body as text — used by the text-based preview renderers
 * (markdown/CSV/JSON/code). A 10 MB cap avoids hanging the tab trying to syntax-highlight or
 * table-ify something enormous; those files fall back to "download to view". */
const MAX_INLINE_TEXT_BYTES = 10 * 1024 * 1024;

export function useFileText(url: string | undefined) {
  return useQuery({
    queryKey: ["file-text", url],
    queryFn: async () => {
      const response = await fetch(url!);
      if (!response.ok) {
        throw new Error(`Failed to load file content (${response.status})`);
      }
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > MAX_INLINE_TEXT_BYTES) {
        throw new Error("File is too large to preview inline — download it instead.");
      }
      return response.text();
    },
    enabled: Boolean(url),
    staleTime: 60_000,
  });
}
