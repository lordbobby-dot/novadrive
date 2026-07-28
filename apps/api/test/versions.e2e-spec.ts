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
  name: string;
  folderId: string;
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

interface SignedUrlBody {
  url: string;
}

interface FileVersionBody {
  id: string;
  versionNumber: number;
}

describe('File versions: add/list/restore/download (e2e, real Postgres + S3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-versions-e2e-${Date.now()}`;
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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Versions E2E' },
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

  async function waitForCompletion(uploadId: string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const status = await request(app.getHttpServer())
        .get(`/uploads/${uploadId}`)
        .set(...auth())
        .expect(200);
      const body = status.body as UploadStatusResponse;
      if (body.status === 'COMPLETED') return;
      if (body.status === 'FAILED') throw new Error('Fixture upload failed');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Timed out waiting for upload to complete');
  }

  async function uploadNewFile(
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

    await waitForCompletion(initiate.uploadId);

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

  /** Uploads new bytes through the exact same multipart pipeline, but completes it as a new
   * version of an existing file instead of a new file. */
  async function uploadNewVersion(
    fileId: string,
    folderId: string,
    content: Buffer,
  ): Promise<void> {
    const checksum = createHash('sha256').update(content).digest('hex');
    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'ignored-for-versions.txt',
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
      .send({ versionOfFileId: fileId })
      .expect(201);

    await waitForCompletion(initiate.uploadId);
  }

  async function fetchSignedContent(url: string): Promise<Buffer> {
    const downloaded = await fetch(url);
    return Buffer.from(await downloaded.arrayBuffer());
  }

  it('edit a file twice, see two versions, restore the first, confirm current content matches', async () => {
    const root = await getRoot();
    const v1Content = Buffer.from('version one content');
    const v2Content = Buffer.from('version two content, longer and different');

    const file = await uploadNewFile('editable.txt', root.id, v1Content);

    // Every new file gets an automatic version 1 pointing at the upload it was created with.
    const afterCreate = await request(app.getHttpServer())
      .get(`/files/${file.id}/versions`)
      .set(...auth())
      .expect(200);
    expect(afterCreate.body as FileVersionBody[]).toHaveLength(1);

    await uploadNewVersion(file.id, root.id, v2Content);

    const afterSecondUpload = await request(app.getHttpServer())
      .get(`/files/${file.id}/versions`)
      .set(...auth())
      .expect(200);
    const versions = afterSecondUpload.body as FileVersionBody[];
    expect(versions).toHaveLength(2);
    // Newest first.
    expect(versions[0].versionNumber).toBe(2);
    expect(versions[1].versionNumber).toBe(1);

    const currentUrl = await request(app.getHttpServer())
      .get(`/files/${file.id}/download-url`)
      .set(...auth())
      .expect(200);
    const currentBytes = await fetchSignedContent(
      (currentUrl.body as SignedUrlBody).url,
    );
    expect(currentBytes.equals(v2Content)).toBe(true);

    await request(app.getHttpServer())
      .post(`/files/${file.id}/versions/1/restore`)
      .set(...auth())
      .expect(201);

    const afterRestoreUrl = await request(app.getHttpServer())
      .get(`/files/${file.id}/download-url`)
      .set(...auth())
      .expect(200);
    const restoredBytes = await fetchSignedContent(
      (afterRestoreUrl.body as SignedUrlBody).url,
    );
    expect(restoredBytes.equals(v1Content)).toBe(true);

    // Restoring must not have lost the version it replaced.
    const afterRestoreList = await request(app.getHttpServer())
      .get(`/files/${file.id}/versions`)
      .set(...auth())
      .expect(200);
    expect(afterRestoreList.body as FileVersionBody[]).toHaveLength(2);

    // Version 2's content must still be directly downloadable even though it's no longer current.
    const v2Url = await request(app.getHttpServer())
      .get(`/files/${file.id}/versions/2/download-url`)
      .set(...auth())
      .expect(200);
    const v2Bytes = await fetchSignedContent((v2Url.body as SignedUrlBody).url);
    expect(v2Bytes.equals(v2Content)).toBe(true);
  }, 40_000);

  it('returns 404 restoring a version number that does not exist', async () => {
    const root = await getRoot();
    const file = await uploadNewFile(
      'no-such-version.txt',
      root.id,
      Buffer.from('only one version'),
    );

    await request(app.getHttpServer())
      .post(`/files/${file.id}/versions/99/restore`)
      .set(...auth())
      .expect(404);
  }, 20_000);
});
