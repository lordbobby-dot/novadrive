export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

/** Extensions blocked by default — executables/installers/scripts, not content types. */
export const DENIED_EXTENSIONS = new Set([
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'scr',
  'vbs',
  'ps1',
  'dll',
  'sh',
  'bash',
]);

export class UploadValidationError extends Error {}

export function validateUploadRequest(params: {
  name: string;
  size: string;
  contentType: string;
}): void {
  const sizeBytes = BigInt(params.size);
  if (sizeBytes <= 0n) {
    throw new UploadValidationError('File size must be positive');
  }
  if (sizeBytes > BigInt(MAX_UPLOAD_SIZE_BYTES)) {
    throw new UploadValidationError(
      `File exceeds the maximum upload size of ${MAX_UPLOAD_SIZE_BYTES} bytes`,
    );
  }

  const extension = params.name.split('.').pop()?.toLowerCase();
  if (extension && DENIED_EXTENSIONS.has(extension)) {
    throw new UploadValidationError(
      `Files with the ".${extension}" extension are not allowed`,
    );
  }
}
