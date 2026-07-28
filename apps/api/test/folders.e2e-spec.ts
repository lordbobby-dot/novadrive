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
  name: string;
  parentId: string | null;
  depth: number;
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

describe('Folders + Files (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-folders-e2e-${Date.now()}`;
  let userId: string;

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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Folders E2E' },
    });
    userId = user.id;

    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  const auth = () => ['Authorization', 'Bearer test-token'] as [string, string];

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

  it('lazily creates and returns the root folder', async () => {
    const root = await getRoot();
    expect(root.parentId).toBeNull();
    expect(root.name).toBe('My Drive');

    const again = await getRoot();
    expect(again.id).toBe(root.id);
  });

  it('rejects renaming the root folder', async () => {
    const root = await getRoot();
    await request(app.getHttpServer())
      .patch(`/folders/${root.id}/rename`)
      .set(...auth())
      .send({ name: 'Nope' })
      .expect(400);
  });

  it('creates nested folders, resolves breadcrumbs, and lists children with cursor pagination', async () => {
    const root = await getRoot();

    const photos = await createFolder('Photos', root.id);
    const year2026 = await createFolder('2026', photos.id);
    expect(year2026.depth).toBe(2);

    const breadcrumb = await request(app.getHttpServer())
      .get(`/folders/${year2026.id}/breadcrumb`)
      .set(...auth())
      .expect(200);
    const breadcrumbBody = breadcrumb.body as FolderBody[];
    expect(breadcrumbBody.map((f) => f.name)).toEqual([
      'My Drive',
      'Photos',
      '2026',
    ]);

    // Create a few more root-level siblings to exercise pagination.
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await createFolder(name, root.id);
    }

    const firstPage = await request(app.getHttpServer())
      .get(`/folders/${root.id}/children?limit=2`)
      .set(...auth())
      .expect(200);
    const firstPageBody = firstPage.body as PageBody<FolderBody>;
    expect(firstPageBody.items).toHaveLength(2);
    expect(firstPageBody.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/folders/${root.id}/children?limit=2&cursor=${firstPageBody.nextCursor}`,
      )
      .set(...auth())
      .expect(200);
    const secondPageBody = secondPage.body as PageBody<FolderBody>;
    expect(secondPageBody.items.length).toBeGreaterThan(0);

    // No overlap between pages.
    const firstIds = new Set(firstPageBody.items.map((f) => f.id));
    for (const item of secondPageBody.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });

  it('renames a non-root folder', async () => {
    const root = await getRoot();
    const folder = await createFolder('Draft', root.id);

    const renamed = await request(app.getHttpServer())
      .patch(`/folders/${folder.id}/rename`)
      .set(...auth())
      .send({ name: 'Final' })
      .expect(200);
    expect((renamed.body as FolderBody).name).toBe('Final');
  });

  it('403s for a folder that belongs to a different owner (PermissionGuard denies)', async () => {
    const otherClerkId = `clerk-other-${Date.now()}`;
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

    await request(app.getHttpServer())
      .get(`/folders/${otherRoot.id}`)
      .set(...auth())
      .expect(403);

    await prisma.user.delete({ where: { id: other.id } });
  });

  it('lists a file under its folder', async () => {
    const root = await getRoot();

    const file = await createStubFile(prisma, {
      ownerId: userId,
      folderId: root.id,
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: '2048',
    });
    expect(file.size).toBe('2048');

    const listed = await request(app.getHttpServer())
      .get(`/files?folderId=${root.id}`)
      .set(...auth())
      .expect(200);
    const listedBody = listed.body as PageBody<FileBody>;
    expect(listedBody.items.some((f) => f.id === file.id)).toBe(true);

    const renamed = await request(app.getHttpServer())
      .patch(`/files/${file.id}/rename`)
      .set(...auth())
      .send({ name: 'report-final.pdf' })
      .expect(200);
    expect((renamed.body as FileBody).name).toBe('report-final.pdf');

    // Binary content never lives in Postgres — only the StorageObject pointer/metadata.
    const persistedFile = await prisma.file.findUniqueOrThrow({
      where: { id: file.id },
    });
    const storageObject = await prisma.storageObject.findUnique({
      where: { id: persistedFile.storageObjectId },
    });
    expect(storageObject?.bucket).toBeDefined();
    expect(storageObject?.size.toString()).toBe('2048');
  });
});
