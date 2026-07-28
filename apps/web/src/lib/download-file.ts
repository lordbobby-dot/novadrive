/** Triggers a browser download for a signed S3 URL. The URL's `Content-Disposition: attachment`
 * header (set server-side when the URL was presigned) is what actually forces the download —
 * the anchor's `download` attribute is ignored by browsers for cross-origin URLs like this one,
 * but is harmless to include as a filename hint for same-origin fallbacks. */
export function triggerBrowserDownload(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
