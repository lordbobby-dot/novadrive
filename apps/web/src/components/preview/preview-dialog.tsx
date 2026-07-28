"use client";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDownloadFile, usePreviewUrl } from "@/hooks/use-drive";
import { triggerBrowserDownload } from "@/lib/download-file";
import { detectPreviewKind } from "@/lib/preview-kind";
import { Download, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { ImagePreview } from "./image-preview";
import { VideoPreview } from "./video-preview";
import { AudioPreview } from "./audio-preview";
import { PdfPreview } from "./pdf-preview";
import { MarkdownPreview } from "./markdown-preview";
import { CsvPreview } from "./csv-preview";
import { JsonPreview } from "./json-preview";
import { CodePreview } from "./code-preview";
import { UnsupportedPreview } from "./unsupported-preview";
import { PreviewStatus } from "./preview-status";

export interface PreviewTarget {
  id: string;
  name: string;
  contentType: string;
}

export function PreviewDialog({
  target,
  onOpenChange,
}: {
  target: PreviewTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = usePreviewUrl(target?.id);
  const downloadFile = useDownloadFile();

  async function handleDownload() {
    if (!target) return;
    try {
      const result = await downloadFile.mutateAsync(target.id);
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error(`Failed to download ${target.name}`);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-4xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <DialogTitle className="truncate pr-8">{target?.name}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            {data && (
              <Button
                size="icon-sm"
                variant="ghost"
                nativeButton={false}
                render={<a href={data.url} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink className="size-4" />
                <span className="sr-only">Open in new tab</span>
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void handleDownload()}
              disabled={downloadFile.isPending}
            >
              <Download className="size-4" />
              <span className="sr-only">Download</span>
            </Button>
            <DialogClose render={<Button size="icon-sm" variant="ghost" />}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {isLoading || error || !data || !target ? (
            <PreviewStatus isLoading={isLoading} error={error} />
          ) : (
            <PreviewBody
              url={data.url}
              fileName={target.name}
              contentType={target.contentType}
              onDownload={() => void handleDownload()}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  url,
  fileName,
  contentType,
  onDownload,
}: {
  url: string;
  fileName: string;
  contentType: string;
  onDownload: () => void;
}) {
  const kind = detectPreviewKind(contentType, fileName);

  switch (kind) {
    case "image":
      return <ImagePreview url={url} fileName={fileName} />;
    case "video":
      return <VideoPreview url={url} />;
    case "audio":
      return <AudioPreview url={url} fileName={fileName} />;
    case "pdf":
      return <PdfPreview url={url} />;
    case "markdown":
      return <MarkdownPreview url={url} />;
    case "csv":
      return <CsvPreview url={url} />;
    case "json":
      return <JsonPreview url={url} />;
    case "code":
      return <CodePreview url={url} fileName={fileName} />;
    case "unsupported":
      return <UnsupportedPreview fileName={fileName} onDownload={onDownload} />;
  }
}
