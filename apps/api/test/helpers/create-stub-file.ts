import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

export interface StubFileParams {
  ownerId: string;
  folderId: string;
  name: string;
  contentType: string;
  size: string;
}

export interface StubFile {
  id: string;
  name: string;
  ownerId: string;
  folderId: string;
  contentType: string;
  size: string;
}

/** Creates a File + StorageObject row directly via Prisma, bypassing HTTP entirely. Most e2e
 * specs only need a real DB row to exist to exercise folder/search/sharing/trash/activity/
 * favorites behavior, not real S3 content — this replaces the removed `POST /files` endpoint,
 * which existed purely as this exact fixture-creation shortcut and was never a real product
 * feature (see docs/uploads.md). Tests that need a genuinely downloadable file (e.g.
 * drive-operations.e2e-spec.ts's copy test) still drive the real multipart upload pipeline via
 * their own `uploadRealFile` helper.
 *
 * Uses the real configured bucket (not a fake one) with a throwaway key — S3 DeleteObject on a
 * nonexistent key is a silent no-op, but DeleteObject against a bucket that doesn't exist throws
 * NoSuchBucket, which broke trash.e2e-spec.ts's permanent-delete tests. */
export async function createStubFile(
  prisma: PrismaService,
  params: StubFileParams,
): Promise<StubFile> {
  const row = await prisma.file.create({
    data: {
      name: params.name,
      owner: { connect: { id: params.ownerId } },
      folder: { connect: { id: params.folderId } },
      storageObject: {
        create: {
          owner: { connect: { id: params.ownerId } },
          bucket: process.env.AWS_S3_BUCKET ?? 'novadrive-test-stub',
          objectKey: `stub/${params.ownerId}/${randomUUID()}`,
          contentType: params.contentType,
          size: BigInt(params.size),
          region: 'us-east-1',
          uploadStatus: 'COMPLETED',
        },
      },
    },
    include: { storageObject: true },
  });
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    folderId: row.folderId,
    contentType: row.storageObject.contentType,
    size: row.storageObject.size.toString(),
  };
}
