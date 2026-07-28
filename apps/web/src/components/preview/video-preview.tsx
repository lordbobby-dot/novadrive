export function VideoPreview({ url }: { url: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      {/* The signed URL supports HTTP range requests natively via S3, so seeking works
       * without any extra wiring — the browser issues Range headers on its own. */}
      <video src={url} controls className="max-h-full max-w-full" preload="metadata" />
    </div>
  );
}
