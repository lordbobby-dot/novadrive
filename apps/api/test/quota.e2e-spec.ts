import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual<object>('@clerk/backend'),
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

interface InitiateResponse {
  uploadId: string;
}

interface QuotaResponse {
  usedBytes: string;
  limitBytes: string;
  percentUsed: number;
}

describe('Quota (e2e): reservation, atomic concurrency, and threshold notifications', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-quota-e2e-${Date.now()}`;
  let userId: string;
  let rootFolderId: string;

  const auth = () => ['Authorization', 'Bearer test-token'] as [string, string];

  async function setQuota(limitBytes: number, usedBytes = 0): Promise<void> {
    await prisma.storageQuota.upsert({
      where: {
        subjectType_subjectId: { subjectType: 'USER', subjectId: userId },
      },
      create: {
        subjectType: 'USER',
        subjectId: userId,
        limitBytes: BigInt(limitBytes),
        usedBytes: BigInt(usedBytes),
      },
      update: {
        limitBytes: BigInt(limitBytes),
        usedBytes: BigInt(usedBytes),
        lastNotifiedThreshold: 0,
      },
    });
  }

  function initiate(size: number, name = 'file.bin'): request.Test {
    return request(app.getHttpServer())
      .post('/uploads/initiate')
      .set(...auth())
      .send({
        folderId: rootFolderId,
        name,
        contentType: 'application/octet-stream',
        size: String(size),
      });
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
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);

    const user = await prisma.user.create({
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Quota E2E' },
    });
    userId = user.id;

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    rootFolderId = (root.body as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.storageQuota
      .deleteMany({ where: { subjectType: 'USER', subjectId: userId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects an upload that would exceed the quota with 413, before creating any S3 multipart upload', async () => {
    await setQuota(10_000, 6_000);

    const res = await initiate(6_000);
    expect(res.status).toBe(413);

    const quota = await request(app.getHttpServer())
      .get('/quota')
      .set(...auth())
      .expect(200);
    // Usage is unchanged by the rejected attempt — it never reserved anything.
    expect((quota.body as QuotaResponse).usedBytes).toBe('6000');
  }, 15_000);

  it('accepts an upload within the remaining quota and reflects it in GET /quota', async () => {
    await setQuota(10_000, 0);

    const res = await initiate(4_000).expect(201);
    const uploadId = (res.body as InitiateResponse).uploadId;
    expect(uploadId).toBeDefined();

    const quota = await request(app.getHttpServer())
      .get('/quota')
      .set(...auth())
      .expect(200);
    expect((quota.body as QuotaResponse).usedBytes).toBe('4000');

    // Cleanup: abort releases the reservation.
    await request(app.getHttpServer())
      .post(`/uploads/${uploadId}/abort`)
      .set(...auth())
      .expect(204);
    const afterAbort = await request(app.getHttpServer())
      .get('/quota')
      .set(...auth())
      .expect(200);
    expect((afterAbort.body as QuotaResponse).usedBytes).toBe('0');
  }, 15_000);

  it('stays exactly accurate under concurrent reservation attempts at the limit', async () => {
    await setQuota(10_000, 0);

    // 20 concurrent requests for 1000 bytes each against a 10,000-byte limit — at most 10 can
    // succeed. The atomic conditional UPDATE (not read-then-write) is what prevents more than 10
    // from slipping through a check-then-act race.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => initiate(1_000)),
    );
    const succeeded = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 413);

    expect(succeeded).toHaveLength(10);
    expect(rejected).toHaveLength(10);

    const quota = await request(app.getHttpServer())
      .get('/quota')
      .set(...auth())
      .expect(200);
    expect((quota.body as QuotaResponse).usedBytes).toBe('10000');

    // Cleanup: abort every successful reservation.
    await Promise.all(
      succeeded.map((r) =>
        request(app.getHttpServer())
          .post(`/uploads/${(r.body as InitiateResponse).uploadId}/abort`)
          .set(...auth()),
      ),
    );
  }, 30_000);

  it('fires a QUOTA_WARNING notification exactly once when crossing 80%, not again while still in that band', async () => {
    await setQuota(1_000, 0);
    await prisma.notification.deleteMany({
      where: { recipientId: userId, type: 'QUOTA_WARNING' },
    });

    // Crosses from 0% to 85% — past the 80% threshold.
    const first = await initiate(850).expect(201);

    await new Promise((resolve) => setTimeout(resolve, 200)); // let the async listener run
    const afterFirst = await prisma.notification.findMany({
      where: { recipientId: userId, type: 'QUOTA_WARNING' },
    });
    expect(afterFirst).toHaveLength(1);

    // A second small reservation stays within the 80-95% band — no second notification.
    const second = await initiate(50).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterSecond = await prisma.notification.findMany({
      where: { recipientId: userId, type: 'QUOTA_WARNING' },
    });
    expect(afterSecond).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/uploads/${(first.body as InitiateResponse).uploadId}/abort`)
      .set(...auth());
    await request(app.getHttpServer())
      .post(`/uploads/${(second.body as InitiateResponse).uploadId}/abort`)
      .set(...auth());
  }, 15_000);
});
