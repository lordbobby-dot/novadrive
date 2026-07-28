import { computeUploadParts } from './upload-session.entity';

describe('computeUploadParts', () => {
  it('throws for non-positive sizes', () => {
    expect(() => computeUploadParts(0n)).toThrow();
    expect(() => computeUploadParts(-1n)).toThrow();
  });

  it('uses a single part for files smaller than the target part size', () => {
    const { partSize, totalParts } = computeUploadParts(1024n);
    expect(totalParts).toBe(1);
    expect(partSize).toBeGreaterThan(0n);
  });

  it('splits a file larger than one part into multiple parts', () => {
    const eightMiB = 8n * 1024n * 1024n;
    const { totalParts } = computeUploadParts(eightMiB * 3n);
    expect(totalParts).toBe(3);
  });

  it("keeps totalParts within S3's 10,000-part limit for very large files", () => {
    const hugeFile = 500n * 1024n * 1024n * 1024n; // 500 GiB
    const { totalParts, partSize } = computeUploadParts(hugeFile);
    expect(totalParts).toBeLessThanOrEqual(10_000);
    expect(partSize * BigInt(totalParts)).toBeGreaterThanOrEqual(hugeFile);
  });
});
