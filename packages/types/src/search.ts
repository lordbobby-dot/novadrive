export interface SearchResultItemResponse {
  type: "file" | "folder";
  id: string;
  name: string;
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  rank: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultPageResponse {
  items: SearchResultItemResponse[];
  nextCursor: string | null;
}
