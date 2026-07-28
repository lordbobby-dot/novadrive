export function formatBytes(size: string | number): string {
  const bytes = typeof size === "string" ? Number(size) : size;
  if (!Number.isFinite(bytes)) return `${size} B`;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
