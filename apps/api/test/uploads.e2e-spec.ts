import { randomBytes, createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import type { EnvConfig } from '../src/config/env.validation';
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

interface InitiateResponse {
  uploadId: string;
  bucket: string;
  objectKey: string;
  partSize: string;
  totalParts: number;
  parts: { partNumber: number; url: string }[];
}

interface PresignedPart {
  partNumber: number;
  url: string;
}

interface UploadStatusResponse {
  uploadId: string;
  status: string;
  totalParts: number | null;
  completedParts: { partNumber: number; eTag: string; size: string }[];
}

interface FileBody {
  id: string;
  name: string;
  size: string;
}

interface PageBody<T> {
  items: T[];
  nextCursor: string | null;
}

describe('Uploads (e2e, real S3 + BullMQ)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-uploads-e2e-${Date.now()}`;
  let userId: string;
  let rootFolderId: string;
  let bucket: string;
  let region: string;

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
    const config = app.get(ConfigService<EnvConfig, true>);
    bucket = config.get('AWS_S3_BUCKET', { infer: true }) ?? '';
    region = config.get('AWS_REGION', { infer: true }) ?? '';

    const user = await prisma.user.create({
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Uploads E2E' },
    });
    userId = user.id;
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    rootFolderId = (root.body as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    // BullMQ's Worker holds its own Redis connection separate from the Queue's; close it
    // explicitly first so app.close() doesn't race it into emitting a stray 'error' event
    // that Jest then misattributes to whichever test file happens to run next.
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  async function uploadPart(url: string, data: Buffer): Promise<string> {
    const response = await fetch(url, {
      method: 'PUT',
      body: Uint8Array.from(data),
    });
    if (!response.ok) {
      throw new Error(
        `Part upload failed: ${response.status} ${await response.text()}`,
      );
    }
    const eTag = response.headers.get('etag');
    if (!eTag) {
      throw new Error('S3 did not return an ETag header for the uploaded part');
    }
    return eTag;
  }

  async function pollStatus(
    uploadId: string,
    until: (s: string) => boolean,
  ): Promise<UploadStatusResponse> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/uploads/${uploadId}`)
        .set(...auth())
        .expect(200);
      const body = res.body as UploadStatusResponse;
      if (until(body.status)) {
        return body;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(
      `Timed out waiting for upload ${uploadId} to reach a terminal status`,
    );
  }

  it('uploads a small single-part file, verifies its checksum, and creates the File', async () => {
    const content = Buffer.from(
      'Hello, NovaDrive! This is a real S3 multipart upload test.',
    );
    const checksum = createHash('sha256').update(content).digest('hex');

    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'hello.txt',
        folderId: rootFolderId,
        contentType: 'text/plain',
        size: content.length.toString(),
        checksum,
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;
    expect(initiate.totalParts).toBe(1);

    const eTag = await uploadPart(initiate.parts[0].url, content);
    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/parts`)
      .set(...auth())
      .send({ partNumber: 1, eTag, size: content.length.toString() })
      .expect(204);

    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/complete`)
      .set(...auth())
      .send({ folderId: rootFolderId, name: 'hello.txt' })
      .expect(201);

    const finalStatus = await pollStatus(
      initiate.uploadId,
      (s) => s === 'COMPLETED' || s === 'FAILED',
    );
    expect(finalStatus.status).toBe('COMPLETED');

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${rootFolderId}`)
      .set(...auth())
      .expect(200);
    const files = (listed.body as PageBody<FileBody>).items;
    const uploaded = files.find((f) => f.name === 'hello.txt');
    expect(uploaded).toBeDefined();
    expect(uploaded?.size).toBe(content.length.toString());
  }, 30_000);

  it('detects a checksum mismatch, marks the upload FAILED, and never creates a File', async () => {
    const content = Buffer.from(
      'This content will be claimed to have the wrong checksum.',
    );
    const wrongChecksum = createHash('sha256')
      .update('not the real content')
      .digest('hex');

    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'corrupt.txt',
        folderId: rootFolderId,
        contentType: 'text/plain',
        size: content.length.toString(),
        checksum: wrongChecksum,
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;

    const eTag = await uploadPart(initiate.parts[0].url, content);
    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/parts`)
      .set(...auth())
      .send({ partNumber: 1, eTag, size: content.length.toString() })
      .expect(204);

    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/complete`)
      .set(...auth())
      .send({ folderId: rootFolderId, name: 'corrupt.txt' })
      .expect(201);

    const finalStatus = await pollStatus(
      initiate.uploadId,
      (s) => s === 'COMPLETED' || s === 'FAILED',
    );
    expect(finalStatus.status).toBe('FAILED');

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${rootFolderId}`)
      .set(...auth())
      .expect(200);
    const files = (listed.body as PageBody<FileBody>).items;
    expect(files.find((f) => f.name === 'corrupt.txt')).toBeUndefined();
  }, 30_000);

  it('quarantines an EICAR test file, marks it QUARANTINED, and never creates a File', async () => {
    // The standard antivirus test string — every real AV engine (including ClamAV) is
    // configured to flag it as "infected" without it containing any actual malicious code.
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const checksum = createHash('sha256').update(eicar).digest('hex');

    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'eicar.txt',
        folderId: rootFolderId,
        contentType: 'text/plain',
        size: eicar.length.toString(),
        checksum,
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;

    const eTag = await uploadPart(initiate.parts[0].url, eicar);
    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/parts`)
      .set(...auth())
      .send({ partNumber: 1, eTag, size: eicar.length.toString() })
      .expect(204);

    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/complete`)
      .set(...auth())
      .send({ folderId: rootFolderId, name: 'eicar.txt' })
      .expect(201);

    const finalStatus = await pollStatus(
      initiate.uploadId,
      (s) => s === 'COMPLETED' || s === 'FAILED' || s === 'QUARANTINED',
    );
    expect(finalStatus.status).toBe('QUARANTINED');

    // Never downloadable: no File row is ever created for a quarantined upload, so there's no
    // File id to request a download URL for in the first place — structurally unreachable
    // rather than merely access-denied.
    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${rootFolderId}`)
      .set(...auth())
      .expect(200);
    const files = (listed.body as PageBody<FileBody>).items;
    expect(files.find((f) => f.name === 'eicar.txt')).toBeUndefined();
  }, 30_000);

  it('uploads a real multi-part file (2 parts) and reassembles it correctly', async () => {
    const partA = randomBytes(8 * 1024 * 1024); // 8 MiB — meets S3's non-last-part minimum
    const partB = randomBytes(2 * 1024 * 1024); // 2 MiB — the smaller final part
    const fullContent = Buffer.concat([partA, partB]);
    const checksum = createHash('sha256').update(fullContent).digest('hex');

    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'multipart.bin',
        folderId: rootFolderId,
        contentType: 'application/octet-stream',
        size: fullContent.length.toString(),
        checksum,
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;
    expect(initiate.totalParts).toBe(2);

    const findPart = (n: number): PresignedPart => {
      const part = initiate.parts.find((p) => p.partNumber === n);
      if (!part) throw new Error(`Missing presigned URL for part ${n}`);
      return part;
    };

    const eTag1 = await uploadPart(findPart(1).url, partA);
    const eTag2 = await uploadPart(findPart(2).url, partB);

    for (const [partNumber, eTag, size] of [
      [1, eTag1, partA.length],
      [2, eTag2, partB.length],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/uploads/${initiate.uploadId}/parts`)
        .set(...auth())
        .send({ partNumber, eTag, size: size.toString() })
        .expect(204);
    }

    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/complete`)
      .set(...auth())
      .send({ folderId: rootFolderId, name: 'multipart.bin' })
      .expect(201);

    const finalStatus = await pollStatus(
      initiate.uploadId,
      (s) => s === 'COMPLETED' || s === 'FAILED',
    );
    expect(finalStatus.status).toBe('COMPLETED');
  }, 60_000);

  it('aborts an in-progress upload cleanly', async () => {
    const content = Buffer.from('abandoned upload');
    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'abandoned.txt',
        folderId: rootFolderId,
        contentType: 'text/plain',
        size: content.length.toString(),
      })
      .expect(201);
    const initiate = initiateRes.body as InitiateResponse;

    await request(app.getHttpServer())
      .post(`/uploads/${initiate.uploadId}/abort`)
      .set(...auth())
      .expect(204);

    const status = await request(app.getHttpServer())
      .get(`/uploads/${initiate.uploadId}`)
      .set(...auth())
      .expect(200);
    expect((status.body as UploadStatusResponse).status).toBe('ABORTED');
  }, 30_000);

  it("404s when accessing another user's upload", async () => {
    const otherClerkId = `clerk-uploads-other-${Date.now()}`;
    const other = await prisma.user.create({
      data: { clerkId: otherClerkId, email: `${otherClerkId}@example.com` },
    });
    const otherRoot = await prisma.folder.create({
      data: {
        ownerId: other.id,
        name: "Other's Drive",
        parentId: null,
        path: '/',
        depth: 0,
      },
    });
    const otherUpload = await prisma.storageObject.create({
      data: {
        owner: { connect: { id: other.id } },
        bucket,
        objectKey: `uploads/${other.id}/isolated`,
        region,
        contentType: 'text/plain',
        size: 1n,
        uploadStatus: 'PENDING',
      },
    });

    await request(app.getHttpServer())
      .get(`/uploads/${otherUpload.id}`)
      .set(...auth())
      .expect(404);

    await prisma.user.delete({ where: { id: other.id } });
    void otherRoot;
  });
});
