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
}

interface FileBody {
  id: string;
  name: string;
}

interface FavoritesResultItem {
  type: 'file' | 'folder';
  id: string;
}

interface FavoritesPage {
  items: FavoritesResultItem[];
  nextCursor: string | null;
}

interface FavoritedIdsBody {
  fileIds: string[];
  folderIds: string[];
}

describe('Favorites (e2e): toggle + GET /favorites', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-favorites-e2e-${Date.now()}`;
  const otherClerkId = `clerk-favorites-other-${Date.now()}`;
  let userId: string;
  let otherId: string;
  let rootId: string;

  const authAs = (id: string) => {
    mockedVerifyToken.mockResolvedValue({ sub: id } as never);
    return ['Authorization', 'Bearer test-token'] as [string, string];
  };
  const auth = () => authAs(clerkId);

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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Favorites E2E' },
    });
    userId = user.id;
    const other = await prisma.user.create({
      data: { clerkId: otherClerkId, email: `${otherClerkId}@example.com` },
    });
    otherId = other.id;

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    rootId = (root.body as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: otherId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  async function createFolder(name: string): Promise<FolderBody> {
    const res = await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name, parentId: rootId })
      .expect(201);
    return res.body as FolderBody;
  }

  async function createFile(name: string): Promise<FileBody> {
    return createStubFile(prisma, {
      ownerId: userId,
      folderId: rootId,
      name,
      contentType: 'text/plain',
      size: '10',
    });
  }

  async function listFavorites(): Promise<FavoritesPage> {
    const res = await request(app.getHttpServer())
      .get('/favorites')
      .set(...auth())
      .expect(200);
    return res.body as FavoritesPage;
  }

  it('favorites and unfavorites a file, reflected in GET /favorites', async () => {
    const file = await createFile(`Fav${Date.now()}.txt`);

    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);

    let page = await listFavorites();
    expect(page.items.some((i) => i.id === file.id && i.type === 'file')).toBe(
      true,
    );

    await request(app.getHttpServer())
      .delete(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);

    page = await listFavorites();
    expect(page.items.some((i) => i.id === file.id)).toBe(false);
  });

  it('favorites and unfavorites a folder, reflected in GET /favorites', async () => {
    const folder = await createFolder(`FavFolder${Date.now()}`);

    await request(app.getHttpServer())
      .put(`/folders/${folder.id}/favorite`)
      .set(...auth())
      .expect(204);

    let page = await listFavorites();
    expect(
      page.items.some((i) => i.id === folder.id && i.type === 'folder'),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/folders/${folder.id}/favorite`)
      .set(...auth())
      .expect(204);

    page = await listFavorites();
    expect(page.items.some((i) => i.id === folder.id)).toBe(false);
  });

  it('is idempotent — favoriting twice or unfavoriting twice does not error', async () => {
    const file = await createFile(`Idempotent${Date.now()}.txt`);

    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);
    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);

    const page = await listFavorites();
    expect(page.items.filter((i) => i.id === file.id)).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);
  });

  it("403s favoriting a file that doesn't exist — PermissionGuard rejects before the use case's own NotFoundException check is ever reached, same anti-enumeration shape as every other resource route", async () => {
    await request(app.getHttpServer())
      .put('/files/does-not-exist/favorite')
      .set(...auth())
      .expect(403);
  });

  it("403s favoriting another user's file (no shared permission)", async () => {
    const file = await createFile(`Private${Date.now()}.txt`);
    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...authAs(otherClerkId))
      .expect(403);
  });

  it("never returns another user's favorites", async () => {
    const file = await createFile(`Isolated${Date.now()}.txt`);
    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);

    const otherRoot = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...authAs(otherClerkId))
      .expect(200);
    const otherRootId = (otherRoot.body as { id: string }).id;
    const otherFile = await createStubFile(prisma, {
      ownerId: otherId,
      folderId: otherRootId,
      name: `OtherFav${Date.now()}.txt`,
      contentType: 'text/plain',
      size: '10',
    });
    await request(app.getHttpServer())
      .put(`/files/${otherFile.id}/favorite`)
      .set(...authAs(otherClerkId))
      .expect(204);

    const page = await listFavorites();
    expect(page.items.some((i) => i.id === otherFile.id)).toBe(false);
  });

  it('excludes trashed files from favorites', async () => {
    const file = await createFile(`TrashedFav${Date.now()}.txt`);
    await request(app.getHttpServer())
      .put(`/files/${file.id}/favorite`)
      .set(...auth())
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/files/${file.id}`)
      .set(...auth())
      .expect(204);

    const page = await listFavorites();
    expect(page.items.some((i) => i.id === file.id)).toBe(false);
  });

  describe('GET /favorites/check', () => {
    it('returns exactly the requested ids that are favorited, omitting the rest', async () => {
      const favoritedFile = await createFile(`CheckFav${Date.now()}.txt`);
      const unfavoritedFile = await createFile(`CheckUnfav${Date.now()}.txt`);
      const favoritedFolder = await createFolder(`CheckFavFolder${Date.now()}`);

      await request(app.getHttpServer())
        .put(`/files/${favoritedFile.id}/favorite`)
        .set(...auth())
        .expect(204);
      await request(app.getHttpServer())
        .put(`/folders/${favoritedFolder.id}/favorite`)
        .set(...auth())
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(
          `/favorites/check?fileIds=${favoritedFile.id},${unfavoritedFile.id}&folderIds=${favoritedFolder.id}`,
        )
        .set(...auth())
        .expect(200);

      const body = res.body as FavoritedIdsBody;
      expect(body.fileIds).toEqual([favoritedFile.id]);
      expect(body.folderIds).toEqual([favoritedFolder.id]);
    });

    it("never reports another user's favorites, even for the same id", async () => {
      const file = await createFile(`CheckIsolated${Date.now()}.txt`);
      await request(app.getHttpServer())
        .put(`/files/${file.id}/favorite`)
        .set(...auth())
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/favorites/check?fileIds=${file.id}`)
        .set(...authAs(otherClerkId))
        .expect(200);

      expect((res.body as FavoritedIdsBody).fileIds).toEqual([]);
    });

    it('returns empty arrays when no ids are supplied, without erroring', async () => {
      const res = await request(app.getHttpServer())
        .get('/favorites/check')
        .set(...auth())
        .expect(200);

      expect(res.body).toEqual({ fileIds: [], folderIds: [] });
    });
  });
});
