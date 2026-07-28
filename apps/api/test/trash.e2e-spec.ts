import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ChecksumVerificationProcessor } from '../src/modules/uploads/infrastructure/checksum-verification.processor';
import { TrashCleanupProcessor } from '../src/modules/trash/infrastructure/trash-cleanup.processor';
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

interface TrashItemBody {
  trashId: string;
  type: 'file' | 'folder';
  id: string;
  name: string;
}

describe('Trash: list/restore/permanent-delete (e2e, real Postgres + S3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-trash-e2e-${Date.now()}`;
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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Trash E2E' },
    });
    userId = user.id;
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    await app.get(TrashCleanupProcessor).worker.close();
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

  async function listTrashRoots(): Promise<TrashItemBody[]> {
    const res = await request(app.getHttpServer())
      .get('/trash')
      .set(...auth())
      .expect(200);
    return (res.body as PageBody<TrashItemBody>).items;
  }

  describe('list', () => {
    it('shows a trashed folder once, not once per descendant', async () => {
      const root = await getRoot();
      const parent = await createFolder('TrashListParent', root.id);
      const child = await createFolder('TrashListChild', parent.id);
      await createStubFile('parent-file.txt', parent.id);
      await createStubFile('child-file.txt', child.id);

      await request(app.getHttpServer())
        .delete(`/folders/${parent.id}`)
        .set(...auth())
        .expect(200);

      const items = await listTrashRoots();
      const matching = items.filter((item) => item.id === parent.id);
      expect(matching).toHaveLength(1);
      expect(items.some((item) => item.id === child.id)).toBe(false);
    });

    it('shows a standalone trashed file', async () => {
      const root = await getRoot();
      const folder = await createFolder('TrashListStandalone', root.id);
      const file = await createStubFile('standalone.txt', folder.id);

      await request(app.getHttpServer())
        .delete(`/files/${file.id}`)
        .set(...auth())
        .expect(204);

      const items = await listTrashRoots();
      expect(
        items.some((item) => item.id === file.id && item.type === 'file'),
      ).toBe(true);
    });
  });

  describe('restore', () => {
    it('restores a file to its original folder when that folder is intact', async () => {
      const root = await getRoot();
      const folder = await createFolder('RestoreFileFolder', root.id);
      const file = await createStubFile('restorable.txt', folder.id);

      await request(app.getHttpServer())
        .delete(`/files/${file.id}`)
        .set(...auth())
        .expect(204);

      const res = await request(app.getHttpServer())
        .post(`/files/${file.id}/restore`)
        .set(...auth())
        .expect(201);
      expect((res.body as FileBody).folderId).toBe(folder.id);

      const listed = await request(app.getHttpServer())
        .get(`/files?folderId=${folder.id}`)
        .set(...auth())
        .expect(200);
      expect(
        (listed.body as PageBody<FileBody>).items.some((f) => f.id === file.id),
      ).toBe(true);
    });

    it('relocates a file to root when its original folder was also deleted', async () => {
      const root = await getRoot();
      const folder = await createFolder('RestoreFallbackFolder', root.id);
      const file = await createStubFile('orphaned.txt', folder.id);

      await request(app.getHttpServer())
        .delete(`/files/${file.id}`)
        .set(...auth())
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/folders/${folder.id}`)
        .set(...auth())
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/files/${file.id}/restore`)
        .set(...auth())
        .expect(201);
      expect((res.body as FileBody).folderId).toBe(root.id);
    });

    it('restores a folder and its entire subtree together', async () => {
      const root = await getRoot();
      const parent = await createFolder('RestoreSubtreeParent', root.id);
      const child = await createFolder('RestoreSubtreeChild', parent.id);
      const parentFile = await createStubFile('p.txt', parent.id);
      const childFile = await createStubFile('c.txt', child.id);

      await request(app.getHttpServer())
        .delete(`/folders/${parent.id}`)
        .set(...auth())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/folders/${parent.id}/restore`)
        .set(...auth())
        .expect(201);

      const parentChildren = await request(app.getHttpServer())
        .get(`/folders/${root.id}/children`)
        .set(...auth())
        .expect(200);
      expect(
        (parentChildren.body as PageBody<FolderBody>).items.some(
          (f) => f.id === parent.id,
        ),
      ).toBe(true);

      const childrenOfParent = await request(app.getHttpServer())
        .get(`/folders/${parent.id}/children`)
        .set(...auth())
        .expect(200);
      expect(
        (childrenOfParent.body as PageBody<FolderBody>).items.some(
          (f) => f.id === child.id,
        ),
      ).toBe(true);

      const parentFiles = await request(app.getHttpServer())
        .get(`/files?folderId=${parent.id}`)
        .set(...auth())
        .expect(200);
      expect(
        (parentFiles.body as PageBody<FileBody>).items.some(
          (f) => f.id === parentFile.id,
        ),
      ).toBe(true);

      const childFiles = await request(app.getHttpServer())
        .get(`/files?folderId=${child.id}`)
        .set(...auth())
        .expect(200);
      expect(
        (childFiles.body as PageBody<FileBody>).items.some(
          (f) => f.id === childFile.id,
        ),
      ).toBe(true);
    });
  });

  describe('permanent delete', () => {
    it('permanently deletes a trashed file — the row is gone, not just hidden', async () => {
      const root = await getRoot();
      const folder = await createFolder('PermanentDeleteFolder', root.id);
      const file = await createStubFile('gone-forever.txt', folder.id);

      await request(app.getHttpServer())
        .delete(`/files/${file.id}`)
        .set(...auth())
        .expect(204);

      const items = await listTrashRoots();
      const entry = items.find((item) => item.id === file.id);
      expect(entry).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/trash/${entry!.trashId}/permanent`)
        .set(...auth())
        .expect(204);

      const row = await prisma.file.findUnique({ where: { id: file.id } });
      expect(row).toBeNull();
    });

    it('permanently deletes a trashed folder and every file inside it', async () => {
      const root = await getRoot();
      const parent = await createFolder('PermanentDeleteSubtree', root.id);
      const child = await createFolder(
        'PermanentDeleteSubtreeChild',
        parent.id,
      );
      const parentFile = await createStubFile('p2.txt', parent.id);
      const childFile = await createStubFile('c2.txt', child.id);

      await request(app.getHttpServer())
        .delete(`/folders/${parent.id}`)
        .set(...auth())
        .expect(200);

      const items = await listTrashRoots();
      const entry = items.find((item) => item.id === parent.id);
      expect(entry).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/trash/${entry!.trashId}/permanent`)
        .set(...auth())
        .expect(204);

      expect(
        await prisma.folder.findUnique({ where: { id: parent.id } }),
      ).toBeNull();
      expect(
        await prisma.folder.findUnique({ where: { id: child.id } }),
      ).toBeNull();
      expect(
        await prisma.file.findUnique({ where: { id: parentFile.id } }),
      ).toBeNull();
      expect(
        await prisma.file.findUnique({ where: { id: childFile.id } }),
      ).toBeNull();
    });

    it('returns 404 for a trash id that does not belong to the caller', async () => {
      await request(app.getHttpServer())
        .delete('/trash/does-not-exist/permanent')
        .set(...auth())
        .expect(404);
    });
  });
});
