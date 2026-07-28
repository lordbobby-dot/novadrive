export type SearchResultType = 'file' | 'folder';

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  name: string;
  /** The containing folder id — for a file, its folderId; for a folder, its parentId (null
   * only for the root folder, which can never match a search since it has no meaningful name). */
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResultPage {
  items: SearchResultItem[];
  nextCursor: string | null;
}
