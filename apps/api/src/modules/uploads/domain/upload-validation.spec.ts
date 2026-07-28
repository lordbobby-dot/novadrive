import {
  MAX_UPLOAD_SIZE_BYTES,
  UploadValidationError,
  validateUploadRequest,
} from './upload-validation';

describe('validateUploadRequest', () => {
  it('accepts a valid request', () => {
    expect(() =>
      validateUploadRequest({
        name: 'report.pdf',
        size: '1024',
        contentType: 'application/pdf',
      }),
    ).not.toThrow();
  });

  it('rejects a non-positive size', () => {
    expect(() =>
      validateUploadRequest({
        name: 'report.pdf',
        size: '0',
        contentType: 'application/pdf',
      }),
    ).toThrow(UploadValidationError);
  });

  it('rejects a size over the configured maximum', () => {
    expect(() =>
      validateUploadRequest({
        name: 'huge.bin',
        size: (BigInt(MAX_UPLOAD_SIZE_BYTES) + 1n).toString(),
        contentType: 'application/octet-stream',
      }),
    ).toThrow(UploadValidationError);
  });

  it('rejects denied extensions', () => {
    expect(() =>
      validateUploadRequest({
        name: 'installer.exe',
        size: '1024',
        contentType: 'application/octet-stream',
      }),
    ).toThrow(UploadValidationError);
  });

  it('is case-insensitive about extensions', () => {
    expect(() =>
      validateUploadRequest({
        name: 'installer.EXE',
        size: '1024',
        contentType: 'application/octet-stream',
      }),
    ).toThrow(UploadValidationError);
  });

  it('allows files with no extension', () => {
    expect(() =>
      validateUploadRequest({
        name: 'README',
        size: '1024',
        contentType: 'text/plain',
      }),
    ).not.toThrow();
  });
});
