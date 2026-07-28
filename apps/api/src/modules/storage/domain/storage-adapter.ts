export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface CompletedPartInput {
  partNumber: number;
  eTag: string;
}

/**
 * Port for multipart object storage. Only ever implemented against S3 in this codebase, but
 * kept as an interface so the upload use cases stay testable without a real S3 client.
 */
export interface StorageAdapter {
  createMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    contentType: string;
  }): Promise<{ uploadId: string }>;

  presignUploadParts(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
    partNumbers: number[];
  }): Promise<PresignedPart[]>;

  completeMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
    parts: CompletedPartInput[];
  }): Promise<{ eTag: string }>;

  abortMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
  }): Promise<void>;

  getObjectStream(params: {
    bucket: string;
    objectKey: string;
  }): Promise<NodeJS.ReadableStream>;

  deleteObject(params: { bucket: string; objectKey: string }): Promise<void>;

  presignGetObject(params: {
    bucket: string;
    objectKey: string;
    /** "attachment" forces a download with the given filename; "inline" allows the browser to
     * render the response directly (used for previews). */
    disposition: 'attachment' | 'inline';
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }>;

  /** Server-side copy — no bytes transit through this app. Used by file/folder "copy" so each
   * copy gets its own independent StorageObject rather than two File rows sharing one S3
   * object (which would make later per-file deletion/versioning ambiguous). */
  copyObject(params: {
    sourceBucket: string;
    sourceObjectKey: string;
    destinationBucket: string;
    destinationObjectKey: string;
  }): Promise<{ eTag: string }>;
}
