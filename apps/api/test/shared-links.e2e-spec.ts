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
import { createStubFile } from './helpers/create-stub-file';

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual<object>('@clerk/backend'),
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

interface FolderBody {
  id: string;
}

interface FileBody {
  id: string;
}

interface PageBody<T> {
  items: T[];
}

interface InitiateResponse {
  uploadId: string;
  parts: { partNumber: number; url: string }[];
}

interface UploadStatusResponse {
  status: string;
}

interface SharedLinkBody {
  id: string;
  token: string;
}

interface SharedLinkAccessBody {
  resourceName: string;
}

interface SharedFolderItemBody {
  id: string;
  name: string;
}

interface SharedFileItemBody {
  id: string;
  name: string;
}

interface SharedLinkDownloadBody {
  url: string;
  fileName: string;
}

describe('SharedLinks (e2e): password / expiry / download-limit enforcement', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ownerClerkId = `clerk-links-owner-${Date.now()}`;
  let ownerId: string;
  let fileId: string;
  const content = Buffer.from('NovaDrive shared-link e2e fixture 🔗');

  const auth = () => ['Authorization', 'Bearer test-token'] as [string, string];

  async function pollUploadStatus(uploadId: string): Promise<string> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/uploads/${uploadId}`)
        .set(...auth())
        .expect(200);
      const status = (res.body as UploadStatusResponse).status;
      if (status === 'COMPLETED' || status === 'FAILED') return status;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`Timed out waiting for upload ${uploadId} to finish`);
  }

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
    const owner = await prisma.user.create({
      data: {
        clerkId: ownerClerkId,
        email: `${ownerClerkId}@example.com`,
        name: 'Links Owner',
      },
    });
    ownerId = owner.id;
    mockedVerifyToken.mockResolvedValue({ sub: ownerClerkId } as never);

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    const rootFolderId = (root.body as FolderBody).id;

    const checksum = createHash('sha256').update(content).digest('hex');
    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'link-fixture.txt',
        folderId: rootFolderId,
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
      .send({ folderId: rootFolderId, name: 'link-fixture.txt' })
      .expect(201);

    const finalStatus = await pollUploadStatus(initiate.uploadId);
    if (finalStatus !== 'COMPLETED') {
      throw new Error('Fixture upload did not complete');
    }

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${rootFolderId}`)
      .set(...auth())
      .expect(200);
    const uploaded = (
      listed.body as PageBody<FileBody & { name: string }>
    ).items.find((f) => f.name === 'link-fixture.txt');
    if (!uploaded) throw new Error('Fixture file not found after upload');
    fileId = uploaded.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  it('enforces a password on an unauthenticated link view and download', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({
        resourceType: 'FILE',
        resourceId: fileId,
        password: 'let-me-in',
      })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    // No password at all.
    await request(app.getHttpServer())
      .get(`/shared-links/${token}`)
      .expect(403);

    // Wrong password.
    await request(app.getHttpServer())
      .get(`/shared-links/${token}`)
      .query({ password: 'wrong' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({ password: 'wrong' })
      .expect(403);

    // Correct password succeeds for both viewing and downloading.
    const viewed = await request(app.getHttpServer())
      .get(`/shared-links/${token}`)
      .query({ password: 'let-me-in' })
      .expect(200);
    expect((viewed.body as SharedLinkAccessBody).resourceName).toBe(
      'link-fixture.txt',
    );

    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({ password: 'let-me-in' })
      .expect(201);
  });

  it('404s a link that has already expired — indistinguishable from a nonexistent token', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({
        resourceType: 'FILE',
        resourceId: fileId,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    const expired = await request(app.getHttpServer()).get(
      `/shared-links/${token}`,
    );
    const nonexistent = await request(app.getHttpServer()).get(
      '/shared-links/this-token-was-never-issued',
    );
    expect(expired.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(expired.body).toEqual(nonexistent.body);
  });

  it('enforces the download limit, including under a race at the exact limit', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FILE', resourceId: fileId, maxDownloads: 2 })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({})
      .expect(201);

    // Third download, and two concurrent attempts right at the limit, must all be rejected —
    // proving the atomic conditional UPDATE (not a plain read-then-write) enforces the cap even
    // under concurrency.
    const [third, concurrentA, concurrentB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/shared-links/${token}/download`)
        .send({}),
      request(app.getHttpServer())
        .post(`/shared-links/${token}/download`)
        .send({}),
      request(app.getHttpServer())
        .post(`/shared-links/${token}/download`)
        .send({}),
    ]);
    expect(third.status).toBe(403);
    expect(concurrentA.status).toBe(403);
    expect(concurrentB.status).toBe(403);
  });

  it('rejects downloading a link created without download permission', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FILE', resourceId: fileId, canDownload: false })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({})
      .expect(403);
  });

  it('owner can revoke a link, after which it 404s like a nonexistent token', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FILE', resourceId: fileId })
      .expect(201);
    const { id, token } = link.body as SharedLinkBody;

    await request(app.getHttpServer())
      .delete(`/shared-links/${id}`)
      .set(...auth())
      .expect(204);

    await request(app.getHttpServer())
      .get(`/shared-links/${token}`)
      .expect(404);
  });
});

describe('SharedLinks (e2e): browsing a shared FOLDER', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ownerClerkId = `clerk-folder-links-owner-${Date.now()}`;
  let ownerId: string;
  let sharedFolderId: string;
  let sharedFolderName: string;
  let subfolderId: string;
  let rootFileId: string;
  let nestedFileId: string;
  let unrelatedFolderId: string;

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
    const owner = await prisma.user.create({
      data: {
        clerkId: ownerClerkId,
        email: `${ownerClerkId}@example.com`,
        name: 'Folder Links Owner',
      },
    });
    ownerId = owner.id;
    mockedVerifyToken.mockResolvedValue({ sub: ownerClerkId } as never);

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    const rootFolderId = (root.body as FolderBody).id;

    sharedFolderName = `Shared${Date.now()}`;
    const sharedFolder = await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name: sharedFolderName, parentId: rootFolderId })
      .expect(201);
    sharedFolderId = (sharedFolder.body as FolderBody).id;

    const subfolder = await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name: 'Nested', parentId: sharedFolderId })
      .expect(201);
    subfolderId = (subfolder.body as FolderBody).id;

    const unrelated = await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name: `Unrelated${Date.now()}`, parentId: rootFolderId })
      .expect(201);
    unrelatedFolderId = (unrelated.body as FolderBody).id;

    const rootFile = await createStubFile(prisma, {
      ownerId,
      folderId: sharedFolderId,
      name: 'root-level.txt',
      contentType: 'text/plain',
      size: '10',
    });
    rootFileId = rootFile.id;

    const nestedFile = await createStubFile(prisma, {
      ownerId,
      folderId: subfolderId,
      name: 'nested.txt',
      contentType: 'text/plain',
      size: '20',
    });
    nestedFileId = nestedFile.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  it("lists the shared folder's own subfolders/files at the root, and the breadcrumb is just itself", async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FOLDER', resourceId: sharedFolderId })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    const folders = await request(app.getHttpServer())
      .get(`/shared-links/${token}/folders`)
      .expect(200);
    expect(
      (folders.body as PageBody<SharedFolderItemBody>).items.map((f) => f.name),
    ).toEqual(['Nested']);

    const files = await request(app.getHttpServer())
      .get(`/shared-links/${token}/files`)
      .expect(200);
    expect(
      (files.body as PageBody<SharedFileItemBody>).items.map((f) => f.name),
    ).toEqual(['root-level.txt']);

    const breadcrumb = await request(app.getHttpServer())
      .get(`/shared-links/${token}/breadcrumb`)
      .expect(200);
    const chain = breadcrumb.body as SharedFolderItemBody[];
    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual({ id: sharedFolderId, name: sharedFolderName });
  });

  it('browses into a descendant subfolder, and the breadcrumb includes it', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FOLDER', resourceId: sharedFolderId })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    const files = await request(app.getHttpServer())
      .get(`/shared-links/${token}/files`)
      .query({ folderId: subfolderId })
      .expect(200);
    expect(
      (files.body as PageBody<SharedFileItemBody>).items.map((f) => f.name),
    ).toEqual(['nested.txt']);

    const breadcrumb = await request(app.getHttpServer())
      .get(`/shared-links/${token}/breadcrumb`)
      .query({ folderId: subfolderId })
      .expect(200);
    expect(
      (breadcrumb.body as SharedFolderItemBody[]).map((f) => f.id),
    ).toEqual([sharedFolderId, subfolderId]);
  });

  it('404s browsing into a folder outside the shared subtree — not a 403 that would confirm it exists', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FOLDER', resourceId: sharedFolderId })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    await request(app.getHttpServer())
      .get(`/shared-links/${token}/folders`)
      .query({ folderId: unrelatedFolderId })
      .expect(404);
  });

  it('downloads a file discovered by browsing (root level and nested), rejects a missing fileId, and rejects a fileId outside the subtree', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({ resourceType: 'FOLDER', resourceId: sharedFolderId })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    const rootDownload = await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({ fileId: rootFileId })
      .expect(201);
    expect((rootDownload.body as SharedLinkDownloadBody).fileName).toBe(
      'root-level.txt',
    );

    const nestedDownload = await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({ fileId: nestedFileId })
      .expect(201);
    expect((nestedDownload.body as SharedLinkDownloadBody).fileName).toBe(
      'nested.txt',
    );

    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({})
      .expect(400);

    const outsideFile = await createStubFile(prisma, {
      ownerId,
      folderId: unrelatedFolderId,
      name: 'outside.txt',
      contentType: 'text/plain',
      size: '5',
    });
    await request(app.getHttpServer())
      .post(`/shared-links/${token}/download`)
      .send({ fileId: outsideFile.id })
      .expect(404);
  });

  it('enforces the password on browsing endpoints the same way as the metadata endpoint', async () => {
    const link = await request(app.getHttpServer())
      .post('/shared-links')
      .set(...auth())
      .send({
        resourceType: 'FOLDER',
        resourceId: sharedFolderId,
        password: 'shh',
      })
      .expect(201);
    const { token } = link.body as SharedLinkBody;

    await request(app.getHttpServer())
      .get(`/shared-links/${token}/folders`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/shared-links/${token}/folders`)
      .query({ password: 'shh' })
      .expect(200);
  });
});
