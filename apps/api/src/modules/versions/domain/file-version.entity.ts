export interface FileVersion {
  id: string;
  fileId: string;
  storageObjectId: string;
  versionNumber: number;
  createdBy: string;
  changeNote: string | null;
  createdAt: Date;
  contentType: string;
  size: string;
  bucket: string;
  objectKey: string;
  region: string;
}
