# Download & Preview

Covers Milestone 4: signed S3 download URLs, and the frontend preview experience across image,
video, audio, PDF, Markdown, code/text, CSV, and JSON files. See [ROADMAP.md](../ROADMAP.md) for
the milestone's full scope.

## Signed URLs: two endpoints, one difference

`GET /files/:id/download-url` and `GET /files/:id/preview-url` both do the same thing — verify
the requester owns the file (`FileRepository.findById(id, ownerId)`, 404 otherwise) and presign
an S3 `GetObject` URL — differing only in the `Content-Disposition` header baked into the
presigned URL:

- **download**: `attachment; filename="..."` — forces a browser download regardless of how the
  URL is opened.
- **preview**: `inline` — lets the browser render the response directly (`<img>`, `<video>`,
  `fetch()` for text, etc.).

Both are issued by [`S3StorageAdapter.presignGetObject`](../apps/api/src/modules/uploads/infrastructure/s3-storage.adapter.ts),
which also sets `ResponseContentType` explicitly (so a mislabeled S3 object metadata field can't
cause the browser to guess wrong) and a non-ASCII-safe `Content-Disposition` (RFC 5987
`filename*=UTF-8''...` alongside an ASCII `filename=` fallback for older clients).

**TTL**: 5 minutes (`PRESIGNED_DOWNLOAD_URL_TTL_SECONDS`), separate from the upload pipeline's
15-minute part-URL TTL — download/preview URLs are requested right before use, so a short TTL
that verified with a passing tampered-signature e2e test is a purely defense-in-depth window, not
something the UI needs to race against.

**Why this doesn't live in `FilesModule`**: signing requires `STORAGE_ADAPTER` (an S3/AWS SDK
concern that belongs to the upload/storage infrastructure), while ownership-checking requires
`FILE_REPOSITORY` (a Files concern). Rather than importing S3 infrastructure into `FilesModule`
or duplicating the repository binding, `DownloadsModule` imports both `FilesModule` and
`UploadsModule` (which now exports `STORAGE_ADAPTER`) and stays a thin orchestration layer with
no infrastructure of its own — matching the roadmap's explicit call for a dedicated
`DownloadsModule`.

## Frontend: dispatch by content type, not by trusting the browser

[`lib/preview-kind.ts`](../apps/web/src/lib/preview-kind.ts)'s `detectPreviewKind` maps a file to
one of: image, video, audio, pdf, markdown, csv, json, code, or unsupported — primarily by
`contentType`, falling back to the file extension for the text-based formats (markdown/CSV/JSON),
since servers and OSes often report a generic `text/plain` or `application/octet-stream` for
those. [`PreviewDialog`](../apps/web/src/components/preview/preview-dialog.tsx) fetches the
preview URL once (`usePreviewUrl`, a React Query hook with `staleTime: 0` since these URLs are
short-lived) and hands it to the matching renderer:

| Kind | Renderer | Approach |
|---|---|---|
| image | `ImagePreview` | plain `<img>` |
| video | `VideoPreview` | `<video controls>` — range-seeking works automatically since S3 natively serves `Range` requests and the browser issues them on its own |
| audio | `AudioPreview` | `<audio controls>` |
| pdf | `PdfPreview` | `pdfjs-dist`, canvas-rendered, page-by-page (see below) |
| markdown | `MarkdownPreview` | `react-markdown` + `remark-gfm`, styled via `@tailwindcss/typography` |
| csv | `CsvPreview` | `papaparse` → HTML `<table>` |
| json | `JsonPreview` | hand-rolled recursive `JsonTree` (expand/collapse, no dependency added for something this small) |
| code/text | `CodePreview` | `react-syntax-highlighter` (Prism), language guessed from file extension |
| unsupported | `UnsupportedPreview` | icon + a "Download" button (calls the download-url mutation directly, not the already-fetched inline preview URL) |

The markdown/CSV/JSON/code renderers all go through [`useFileText`](../apps/web/src/hooks/use-file-text.ts),
which caps inline fetches at 10 MB and surfaces a "download it instead" error above that — this
is a preview convenience limit, not a security boundary; nothing about it prevents a larger file
from being downloaded normally.

### PDF: bundled pdf.js, not an `<iframe>`

Chrome/Firefox/Safari can all render a PDF natively inside an `<iframe src="...">`, which would
have been the zero-code path. `PdfPreview` uses `pdfjs-dist` directly instead — loading the
document via `getDocument({ url })`, rendering the current page to a `<canvas>`, with Prev/Next
controls for multi-page documents — because the roadmap names "PDF (pdf.js)" specifically, and a
bundled viewer gives consistent behavior (page navigation, no browser-chrome differences) across
every browser rather than delegating to whatever each browser's built-in viewer happens to do.
The worker is resolved via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` —
Next.js/Turbopack's standard bundler-asset pattern — so the worker ships from the same package
version as the main library, with no CDN dependency and no version-mismatch risk.

### Download button: why it can't just reuse the preview URL

The preview dialog's own "Download" button (and `UnsupportedPreview`'s) calls
`useDownloadFile().mutateAsync(fileId)` to fetch a *fresh* download-url, rather than reusing the
already-loaded preview URL with the anchor `download` attribute. The HTML `download` attribute is
ignored by browsers for cross-origin URLs (S3 is a different origin from the app) — what actually
forces a save-as dialog is the response's `Content-Disposition: attachment` header, which only
the download-url endpoint sets. [`lib/download-file.ts`](../apps/web/src/lib/download-file.ts)'s
`triggerBrowserDownload` documents this with a temporary `<a>` click.

### Bundle size

`react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `pdfjs-dist`, and `papaparse` are
sizeable — none of them belong in the Drive page's initial JS. `PreviewDialog` is loaded via
`next/dynamic(..., { ssr: false })` from `drive-view.tsx`, keeping the `/drive/[folderId]` route's
reported First Load JS close to its pre-M4 baseline (measured ~90 KB vs. ~141 KB without the
split) — the preview code only downloads once someone actually opens a file.

## Verification

- Backend: `pnpm --filter api test` (79 unit tests, up from 75) and `pnpm --filter api test:e2e`
  (19 e2e tests, up from 15) both pass. The new `test/downloads.e2e-spec.ts` uploads a real fixture
  file, requests both a download-url and preview-url, actually fetches each signed URL against the
  real S3 bucket and asserts the returned bytes and `Content-Disposition` header, and separately
  asserts a tampered signature is rejected with `403` and a non-owner request is rejected with
  `404`.
- Frontend: `pnpm --filter web typecheck`, `lint`, and `build` all clean.
- Live browser walkthrough (real dev server, real API, real S3): uploaded one file per preview
  kind (PNG, hand-built PDF, JSON, CSV, Markdown, plain text, WAV) and opened each in the preview
  dialog — every renderer displayed correctly, including a real multi-object JSON tree with
  expand/collapse and a real pdf.js canvas render of actual PDF content fetched from S3. The
  audio player correctly detected duration and successfully sought to an arbitrary timestamp
  (`currentTime` updated, `seekable` range populated) — proof the S3 signed URL's range-request
  support works end-to-end through the `<audio>` element. Video wasn't separately exercised (it
  goes through the identical mechanism as audio) since a minimal valid video file can't be
  hand-built the way a minimal WAV can. The download button was confirmed to hit
  `GET /files/:id/download-url` (200 OK, visible in the network log) without a page-content proxy.
- Found and fixed one real bug during this verification pass: `PreviewDialog`'s custom header
  icons (open-in-new-tab/download) visually overlapped the `Dialog` primitive's own
  absolutely-positioned close button, since both wanted the same top-right corner. Fixed by
  setting `showCloseButton={false}` and adding an explicit `DialogClose` into the same icon row.
