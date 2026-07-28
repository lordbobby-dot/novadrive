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
}

interface FileBody {
  id: string;
  name: string;
}

interface ActivityBody {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
}

interface PageBody<T> {
  items: T[];
}

// Activity rows are written by an EventEmitter2 listener asynchronously relative to the HTTP
// response — the use case emits and returns before the listener's `await activity.create(...)`
// necessarily lands. A short poll avoids a flaky race without coupling the test to internals.
async function waitForActivity(
  app: INestApplication<App>,
  auth: () => [string, string],
  predicate: (items: ActivityBody[]) => boolean,
): Promise<ActivityBody[]> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get('/activity?limit=50')
      .set(...auth())
      .expect(200);
    const items = (res.body as PageBody<ActivityBody>).items;
    if (predicate(items) || Date.now() > deadline) return items;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('Activity feed (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-activity-e2e-${Date.now()}`;
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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Activity E2E' },
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

  it('logs a RENAME action with the old and new name', async () => {
    const root = await getRoot();
    const file = await createStubFile('activity-rename-before.txt', root.id);

    await request(app.getHttpServer())
      .patch(`/files/${file.id}/rename`)
      .set(...auth())
      .send({ name: 'activity-rename-after.txt' })
      .expect(200);

    const items = await waitForActivity(app, auth, (rows) =>
      rows.some((row) => row.targetId === file.id && row.action === 'RENAME'),
    );
    const entry = items.find(
      (row) => row.targetId === file.id && row.action === 'RENAME',
    );
    expect(entry).toBeDefined();
    expect(entry!.targetType).toBe('FILE');
    expect(entry!.metadata).toMatchObject({
      oldName: 'activity-rename-before.txt',
      newName: 'activity-rename-after.txt',
    });
  });

  it('logs a DELETE action when a file is soft-deleted', async () => {
    const root = await getRoot();
    const file = await createStubFile('activity-delete.txt', root.id);

    await request(app.getHttpServer())
      .delete(`/files/${file.id}`)
      .set(...auth())
      .expect(204);

    const items = await waitForActivity(app, auth, (rows) =>
      rows.some((row) => row.targetId === file.id && row.action === 'DELETE'),
    );
    const entry = items.find(
      (row) => row.targetId === file.id && row.action === 'DELETE',
    );
    expect(entry).toBeDefined();
    expect(entry!.metadata).toMatchObject({ permanent: false });
  });

  it('filters the feed by targetId and by action', async () => {
    const root = await getRoot();
    const fileA = await createStubFile('activity-filter-a.txt', root.id);
    const fileB = await createStubFile('activity-filter-b.txt', root.id);

    await request(app.getHttpServer())
      .patch(`/files/${fileA.id}/rename`)
      .set(...auth())
      .send({ name: 'activity-filter-a-renamed.txt' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/files/${fileB.id}`)
      .set(...auth())
      .expect(204);

    await waitForActivity(app, auth, (rows) =>
      rows.some((row) => row.targetId === fileB.id && row.action === 'DELETE'),
    );

    const byTarget = await request(app.getHttpServer())
      .get(`/activity?targetId=${fileA.id}`)
      .set(...auth())
      .expect(200);
    const targetItems = (byTarget.body as PageBody<ActivityBody>).items;
    expect(targetItems.every((row) => row.targetId === fileA.id)).toBe(true);
    expect(targetItems.some((row) => row.action === 'RENAME')).toBe(true);

    const byAction = await request(app.getHttpServer())
      .get('/activity?action=DELETE')
      .set(...auth())
      .expect(200);
    const actionItems = (byAction.body as PageBody<ActivityBody>).items;
    expect(actionItems.every((row) => row.action === 'DELETE')).toBe(true);
    expect(actionItems.some((row) => row.targetId === fileB.id)).toBe(true);
  });

  it("never returns another user's activity", async () => {
    const otherClerkId = `clerk-activity-e2e-other-${Date.now()}`;
    const otherUser = await prisma.user.create({
      data: {
        clerkId: otherClerkId,
        email: `${otherClerkId}@example.com`,
        name: 'Other User',
      },
    });
    try {
      await prisma.activity.create({
        data: {
          actorId: otherUser.id,
          action: 'LOGIN',
          targetType: 'ACCOUNT',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/activity?limit=50')
        .set(...auth())
        .expect(200);
      const items = (res.body as PageBody<ActivityBody>).items;
      expect(items.every((row) => row.action !== 'LOGIN')).toBe(true);
    } finally {
      await prisma.user
        .delete({ where: { id: otherUser.id } })
        .catch(() => undefined);
    }
  });
});
