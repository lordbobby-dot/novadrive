export interface DroppedFile {
  file: File;
  /** Directory segments relative to the drop target, e.g. ["Photos", "2026"]. Empty for a
   * plain file drop (or in browsers without the File System Entries API). */
  relativePath: string[];
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walk(entry: FileSystemEntry, path: string[]): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    return [{ file, relativePath: path }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const children: FileSystemEntry[] = [];
    // readEntries must be called repeatedly until it returns an empty array.
    let batch = await readEntries(reader);
    while (batch.length > 0) {
      children.push(...batch);
      batch = await readEntries(reader);
    }
    const nested = await Promise.all(children.map((child) => walk(child, [...path, entry.name])));
    return nested.flat();
  }

  return [];
}

/** Flattens a browser drag-and-drop DataTransfer into files, preserving folder structure when
 * the browser supports the (non-standard but universally implemented) File System Entries API. */
export async function readDroppedItems(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items);
  const supportsEntries = items.length > 0 && typeof items[0].webkitGetAsEntry === "function";

  if (!supportsEntries) {
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: [] }));
  }

  const entries = items
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  const results = await Promise.all(entries.map((entry) => walk(entry, [])));
  return results.flat();
}
