export function ImagePreview({ url, fileName }: { url: string; fileName: string }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed S3 URL, not a static asset next/image can optimize */}
      <img src={url} alt={fileName} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
