"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { PreviewStatus } from "./preview-status";

export function PdfPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const loadingTask = pdfjs.getDocument({ url });
      loadingTaskRef.current = loadingTask;
      const doc = await loadingTask.promise;
      if (cancelled) {
        void loadingTask.destroy();
        return;
      }
      docRef.current = doc;
      setNumPages(doc.numPages);
      setPageNumber(1);
      setLoading(false);
    }

    load().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error("Failed to load PDF"));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      void loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      docRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;

    async function renderPage() {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.5 });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, canvas, viewport }).promise;
    }

    renderPage().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error("Failed to render page"));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pageNumber, loading, error]);

  if (error || loading) {
    return <PreviewStatus isLoading={loading} error={error} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
        <canvas ref={canvasRef} className="shadow" />
      </div>
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-border py-2">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pageNumber} of {numPages}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
