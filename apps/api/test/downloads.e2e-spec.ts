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

interface InitiateResponse {
  uploadId: string;
  totalParts: number;
  parts: { partNumber: number; url: string }[];
}

interface UploadStatusResponse {
  status: string;
}

interface FileBody {
  id: string;
  name: string;
}

interface PageBody<T> {
  items: T[];
  nextCursor: string | null;
}

interface SignedUrlBody {
  url: string;
  expiresAt: string;
  fileName: string;
  contentType: string;
  size: string;
}

describe('Downloads (e2e, real S3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-downloads-e2e-${Date.now()}`;
  let userId: string;
  let rootFolderId: string;
  let fileId: string;
  const content = Buffer.from('NovaDrive download/preview e2e fixture 🎉');

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
    const user = await prisma.user.create({
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Downloads E2E' },
    });
    userId = user.id;
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    rootFolderId = (root.body as { id: string }).id;

    const checksum = createHash('sha256').update(content).digest('hex');
    const initiateRes = await request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        name: 'fixture.txt',
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
      .send({ folderId: rootFolderId, name: 'fixture.txt' })
      .expect(201);

    const finalStatus = await pollUploadStatus(initiate.uploadId);
    if (finalStatus !== 'COMPLETED') {
      throw new Error('Fixture upload did not complete');
    }

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${rootFolderId}`)
      .set(...auth())
      .expect(200);
    const uploaded = (listed.body as PageBody<FileBody>).items.find(
      (f) => f.name === 'fixture.txt',
    );
    if (!uploaded) throw new Error('Fixture file not found after upload');
    fileId = uploaded.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  it('issues a download URL that round-trips to the exact uploaded bytes as an attachment', async () => {
    const res = await request(app.getHttpServer())
      .get(`/files/${fileId}/download-url`)
      .set(...auth())
      .expect(200);
    const body = res.body as SignedUrlBody;
    expect(body.fileName).toBe('fixture.txt');
    expect(body.contentType).toBe('text/plain');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const downloaded = await fetch(body.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-disposition')).toContain(
      'attachment',
    );
    expect(downloaded.headers.get('content-disposition')).toContain(
      'fixture.txt',
    );
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    expect(bytes.equals(content)).toBe(true);
  }, 15_000);

  it('issues a preview URL with an inline disposition', async () => {
    const res = await request(app.getHttpServer())
      .get(`/files/${fileId}/preview-url`)
      .set(...auth())
      .expect(200);
    const body = res.body as SignedUrlBody;

    const previewed = await fetch(body.url);
    expect(previewed.status).toBe(200);
    expect(previewed.headers.get('content-disposition')).toContain('inline');
    const bytes = Buffer.from(await previewed.arrayBuffer());
    expect(bytes.equals(content)).toBe(true);
  }, 15_000);

  it('rejects a signed URL whose signature has been tampered with', async () => {
    const res = await request(app.getHttpServer())
      .get(`/files/${fileId}/download-url`)
      .set(...auth())
      .expect(200);
    const { url } = res.body as SignedUrlBody;

    const tampered = new URL(url);
    const signature = tampered.searchParams.get('X-Amz-Signature');
    tampered.searchParams.set(
      'X-Amz-Signature',
      signature ? `${signature.slice(0, -4)}dead` : 'deadbeef',
    );

    const rejected = await fetch(tampered.toString());
    expect(rejected.status).toBe(403);
  }, 15_000);

  it("403s when requesting another user's file (PermissionGuard denies before the lookup)", async () => {
    const otherClerkId = `clerk-downloads-other-${Date.now()}`;
    const other = await prisma.user.create({
      data: { clerkId: otherClerkId, email: `${otherClerkId}@example.com` },
    });

    mockedVerifyToken.mockResolvedValueOnce({ sub: otherClerkId } as never);
    await request(app.getHttpServer())
      .get(`/files/${fileId}/download-url`)
      .set(...auth())
      .expect(403);

    await prisma.user.delete({ where: { id: other.id } });
  });
});
