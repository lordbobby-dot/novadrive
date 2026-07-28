const INTERNAL_DRAG_MIME = "application/x-novadrive-item";

export interface InternalDragPayload {
  type: "file" | "folder";
  id: string;
  name: string;
}

export function setInternalDragData(
  dataTransfer: DataTransfer,
  payload: InternalDragPayload,
): void {
  dataTransfer.setData(INTERNAL_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = "move";
}

/** Only readable in a `drop` handler — browsers withhold the actual data (only `.types`, not
 * `.getData()`) during `dragover` for security reasons. */
export function readInternalDragData(dataTransfer: DataTransfer): InternalDragPayload | null {
  const raw = dataTransfer.getData(INTERNAL_DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InternalDragPayload;
  } catch {
    return null;
  }
}

/** Safe to call during `dragover` — checks only the available MIME type list, not the data. */
export function isInternalDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(INTERNAL_DRAG_MIME);
}
