import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ChecksumVerificationProcessor } from '../src/modules/uploads/infrastructure/checksum-verification.processor';
import { S3_CLIENT } from '../src/modules/storage/infrastructure/s3-client.provider';
import type { S3Client } from '@aws-sdk/client-s3';
import { createStubFile as createFileFixture } from './helpers/create-stub-file';

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual<object>('@clerk/backend'),
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

interface FolderBody {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

interface FileBody {
  id: string;
  name: string;
  folderId: string;
}

interface PageBody<T> {
  items: T[];
  nextCursor: string | null;
}

interface InitiateResponse {
  uploadId: string;
  totalParts: number;
  parts: { partNumber: number; url: string }[];
}

interface UploadStatusResponse {
  status: string;
}

interface SignedUrlBody {
  url: string;
}

describe('Drive operations: move/copy/delete (e2e, real Postgres + S3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-drive-ops-e2e-${Date.now()}`;
  let userId: string;

  const auth = () => ['Authorization', 'Bearer test-token'] as [string, string];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Drive Ops E2E' },
    });
    userId = user.id;
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  async function getRoot(): Promise<FolderBody> {
    const res = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    return res.body as FolderBody;
  }

  async function createFolder(
    name: string,
    parentId: string,
  ): Promise<FolderBody> {
    const res = await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name, parentId })
      .expect(201);
    return res.body as FolderBody;
  }

  async function createStubFile(
    name: string,
    folderId: string,
  ): Promise<FileBody> {
    return createFileFixture(prisma, {
      ownerId: userId,
      folderId,
      name,
      contentType: 'text/plain',
      size: '10',
    });
  }

  /** Copy needs a real S3 object behind the File (a stub File's objectKey was never actually
   * written to S3), so this drives the full multipart pipeline for a tiny fixture. */
  async function uploadRealFile(
    name: string,
    folderId: string,
    content: Buffer,
  ): Promise<FileBody> {
    const checksum = createHash('sha256').update(content).digest('hex');
    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name,
        folderId,
        contentType: 'text/plain',
        size: content.length.toString(),
        checksum,
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;

    const putResponse = await fetch(initiate.parts[0].url, {
      method: 'PUT',
      body: Uint8Array.from(content),
    });
    const eTag = putResponse.headers.get('etag');
    if (!putResponse.ok || !eTag) {
      throw new Error('Failed to upload the e2e fixture part');
    }
    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/parts`)
      .set(...auth())
      .send({ partNumber: 1, eTag, size: content.length.toString() })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/complete`)
      .set(...auth())
      .send({ folderId, name })
      .expect(201);

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const status = await request(app.getHttpServer())
        .get(`/uploads/${initiate.uploadId}`)
        .set(...auth())
        .expect(200);
      const body = status.body as UploadStatusResponse;
      if (body.status === 'COMPLETED') break;
      if (body.status === 'FAILED') throw new Error('Fixture upload failed');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${folderId}`)
      .set(...auth())
      .expect(200);
    const uploaded = (listed.body as PageBody<FileBody>).items.find(
      (f) => f.name === name,
    );
    if (!uploaded) throw new Error('Fixture file not found after upload');
    return uploaded;
  }

  async function fetchSignedContent(fileId: string): Promise<Buffer> {
    const res = await request(app.getHttpServer())
      .get(`/files/${fileId}/download-url`)
      .set(...auth())
      .expect(200);
    const { url } = res.body as SignedUrlBody;
    const downloaded = await fetch(url);
    return Buffer.from(await downloaded.arrayBuffer());
  }

  describe('folder move', () => {
    it('moves a folder under a new parent', async () => {
      const root = await getRoot();
      const a = await createFolder('MoveSourceParent', root.id);
      const b = await createFolder('MoveTargetParent', root.id);
      const moved = await createFolder('ToMove', a.id);

      const res = await request(app.getHttpServer())
        .patch(`/folders/${moved.id}/move`)
        .set(...auth())
        .send({ targetParentId: b.id })
        .expect(200);
      expect((res.body as FolderBody).parentId).toBe(b.id);

      const aChildren = await request(app.getHttpServer())
        .get(`/folders/${a.id}/children`)
        .set(...auth())
        .expect(200);
      expect(
        (aChildren.body as PageBody<FolderBody>).items.some(
          (f) => f.id === moved.id,
        ),
      ).toBe(false);

      const bChildren = await request(app.getHttpServer())
        .get(`/folders/${b.id}/children`)
        .set(...auth())
        .expect(200);
      expect(
        (bChildren.body as PageBody<FolderBody>).items.some(
          (f) => f.id === moved.id,
        ),
      ).toBe(true);
    });

    it('rejects moving a folder into its own descendant', async () => {
      const root = await getRoot();
      const parent = await createFolder('CycleParent', root.id);
      const child = await createFolder('CycleChild', parent.id);
      const grandchild = await createFolder('CycleGrandchild', child.id);

      await request(app.getHttpServer())
        .patch(`/folders/${parent.id}/move`)
        .set(...auth())
        .send({ targetParentId: grandchild.id })
        .expect(400);
    });

    it('rejects moving the root folder', async () => {
      const root = await getRoot();
      const other = await createFolder('MoveRootTarget', root.id);
      await request(app.getHttpServer())
        .patch(`/folders/${root.id}/move`)
        .set(...auth())
        .send({ targetParentId: other.id })
        .expect(400);
    });
  });

  describe('file move', () => {
    it('moves a file into a different folder', async () => {
      const root = await getRoot();
      const a = await createFolder('FileMoveSource', root.id);
      const b = await createFolder('FileMoveTarget', root.id);
      const file = await createStubFile('movable.txt', a.id);

      const res = await request(app.getHttpServer())
        .patch(`/files/${file.id}/move`)
        .set(...auth())
        .send({ targetFolderId: b.id })
        .expect(200);
      expect((res.body as FileBody).folderId).toBe(b.id);
    });
  });

  describe('file copy', () => {
    it('creates an independent copy with identical bytes but a different id and StorageObject', async () => {
      const root = await getRoot();
      const source = await createFolder('FileCopySource', root.id);
      const target = await createFolder('FileCopyTarget', root.id);
      const content = Buffer.from('Copy me faithfully, byte for byte.');
      const original = await uploadRealFile('original.txt', source.id, content);

      const res = await request(app.getHttpServer())
        .post(`/files/${original.id}/copy`)
        .set(...auth())
        .send({ targetFolderId: target.id, name: 'copied.txt' })
        .expect(201);
      const copy = res.body as FileBody;

      expect(copy.id).not.toBe(original.id);
      expect(copy.name).toBe('copied.txt');
      expect(copy.folderId).toBe(target.id);

      const originalRow = await prisma.file.findUniqueOrThrow({
        where: { id: original.id },
      });
      const copyRow = await prisma.file.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(copyRow.storageObjectId).not.toBe(originalRow.storageObjectId);

      const copiedBytes = await fetchSignedContent(copy.id);
      expect(copiedBytes.equals(content)).toBe(true);

      // The original must still be intact and independently downloadable.
      const originalBytes = await fetchSignedContent(original.id);
      expect(originalBytes.equals(content)).toBe(true);
    }, 30_000);
  });

  describe('folder copy', () => {
    it('deep-copies a folder, its real file, and a nested subfolder', async () => {
      const root = await getRoot();
      const target = await createFolder('FolderCopyTarget', root.id);
      const source = await createFolder('FolderCopySource', root.id);
      const content = Buffer.from('Nested folder copy fixture content.');
      await uploadRealFile('inside.txt', source.id, content);
      const nested = await createFolder('Nested', source.id);
      const nestedContent = Buffer.from('Nested subfolder fixture content.');
      await uploadRealFile('nested-inside.txt', nested.id, nestedContent);

      const res = await request(app.getHttpServer())
        .post(`/folders/${source.id}/copy`)
        .set(...auth())
        .send({ targetParentId: target.id })
        .expect(201);
      const copiedFolder = res.body as FolderBody;
      expect(copiedFolder.id).not.toBe(source.id);
      expect(copiedFolder.parentId).toBe(target.id);

      const copiedFiles = await request(app.getHttpServer())
        .get(`/files?folderId=${copiedFolder.id}`)
        .set(...auth())
        .expect(200);
      const copiedFileItems = (copiedFiles.body as PageBody<FileBody>).items;
      expect(copiedFileItems.some((f) => f.name === 'inside.txt')).toBe(true);
      const copiedInside = copiedFileItems.find(
        (f) => f.name === 'inside.txt',
      )!;
      const copiedBytes = await fetchSignedContent(copiedInside.id);
      expect(copiedBytes.equals(content)).toBe(true);

      const copiedChildren = await request(app.getHttpServer())
        .get(`/folders/${copiedFolder.id}/children`)
        .set(...auth())
        .expect(200);
      const copiedNested = (
        copiedChildren.body as PageBody<FolderBody>
      ).items.find((f) => f.name === 'Nested');
      expect(copiedNested).toBeDefined();

      const nestedFiles = await request(app.getHttpServer())
        .get(`/files?folderId=${copiedNested!.id}`)
        .set(...auth())
        .expect(200);
      expect(
        (nestedFiles.body as PageBody<FileBody>).items.some(
          (f) => f.name === 'nested-inside.txt',
        ),
      ).toBe(true);
    }, 30_000);

    it('rejects copying a folder into itself or its own descendant', async () => {
      const root = await getRoot();
      const folder = await createFolder('CopyCycleParent', root.id);
      const child = await createFolder('CopyCycleChild', folder.id);

      await request(app.getHttpServer())
        .post(`/folders/${folder.id}/copy`)
        .set(...auth())
        .send({ targetParentId: folder.id })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/folders/${folder.id}/copy`)
        .set(...auth())
        .send({ targetParentId: child.id })
        .expect(400);
    });
  });

  describe('file delete', () => {
    it('soft-deletes a file — it disappears from listings but the row still exists', async () => {
      const root = await getRoot();
      const folder = await createFolder('FileDeleteFolder', root.id);
      const file = await createStubFile('to-delete.txt', folder.id);

      await request(app.getHttpServer())
        .delete(`/files/${file.id}`)
        .set(...auth())
        .expect(204);

      const listed = await request(app.getHttpServer())
        .get(`/files?folderId=${folder.id}`)
        .set(...auth())
        .expect(200);
      expect(
        (listed.body as PageBody<FileBody>).items.some((f) => f.id === file.id),
      ).toBe(false);

      const trash = await prisma.trash.findUnique({
        where: { fileId: file.id },
      });
      expect(trash).not.toBeNull();
    });
  });

  describe('recursive folder delete', () => {
    it('soft-deletes a folder and its entire subtree (folders + files)', async () => {
      const root = await getRoot();
      const parent = await createFolder('RecursiveDeleteParent', root.id);
      const child = await createFolder('RecursiveDeleteChild', parent.id);
      await createStubFile('parent-file.txt', parent.id);
      await createStubFile('child-file.txt', child.id);

      const res = await request(app.getHttpServer())
        .delete(`/folders/${parent.id}`)
        .set(...auth())
        .expect(200);
      const body = res.body as { trashedFolders: number; trashedFiles: number };
      expect(body.trashedFolders).toBe(2); // parent + child
      expect(body.trashedFiles).toBe(2);

      const rootChildren = await request(app.getHttpServer())
        .get(`/folders/${root.id}/children`)
        .set(...auth())
        .expect(200);
      expect(
        (rootChildren.body as PageBody<FolderBody>).items.some(
          (f) => f.id === parent.id,
        ),
      ).toBe(false);

      const parentTrash = await prisma.trash.findUnique({
        where: { folderId: parent.id },
      });
      const childTrash = await prisma.trash.findUnique({
        where: { folderId: child.id },
      });
      expect(parentTrash).not.toBeNull();
      expect(childTrash).not.toBeNull();
    });

    it('deletes a 1000+ descendant-file subtree in one batched operation, well under a naive per-row timeout', async () => {
      const root = await getRoot();
      const bigParent = await createFolder('BigSubtree', root.id);

      // Insert 1000 files directly via Prisma — creating them through the API one at a time
      // would measure HTTP/validation overhead, not the thing this test actually cares about:
      // whether the batched Trash insert scales with subtree size or not.
      const storageObjects = Array.from({ length: 1000 }, (_, i) => ({
        id: `so-bulk-${Date.now()}-${i}`,
        ownerId: userId,
        bucket: 'novadrive-dev-test',
        objectKey: `stub/${userId}/bulk-${Date.now()}-${i}`,
        contentType: 'text/plain',
        size: 1n,
        region: 'ap-south-1',
        uploadStatus: 'COMPLETED' as const,
      }));
      await prisma.storageObject.createMany({ data: storageObjects });
      await prisma.file.createMany({
        data: storageObjects.map((so, i) => ({
          id: `file-bulk-${Date.now()}-${i}`,
          name: `bulk-${i}.txt`,
          ownerId: userId,
          folderId: bigParent.id,
          storageObjectId: so.id,
        })),
      });

      const start = Date.now();
      const res = await request(app.getHttpServer())
        .delete(`/folders/${bigParent.id}`)
        .set(...auth())
        .expect(200);
      const elapsedMs = Date.now() - start;

      const body = res.body as { trashedFolders: number; trashedFiles: number };
      expect(body.trashedFolders).toBe(1);
      expect(body.trashedFiles).toBe(1000);
      // Generous bound — the point is proving this is O(1) round trips, not O(n); a per-row
      // implementation would take many seconds to minutes for 1000 rows over HTTP+DB round trips.
      expect(elapsedMs).toBeLessThan(5000);
    }, 20_000);
  });
});
