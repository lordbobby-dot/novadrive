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

interface SearchResultItem {
  type: 'file' | 'folder';
  id: string;
  name: string;
}

interface SearchResultPage {
  items: SearchResultItem[];
  nextCursor: string | null;
}

describe('Search (e2e, real Postgres FTS)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-search-e2e-${Date.now()}`;
  let userId: string;
  let rootId: string;

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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Search E2E' },
    });
    userId = user.id;
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...auth())
      .expect(200);
    rootId = (root.body as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

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

  async function createFile(name: string, folderId: string): Promise<FileBody> {
    return createStubFile(prisma, {
      ownerId: userId,
      folderId,
      name,
      contentType: 'text/plain',
      size: '10',
    });
  }

  async function search(query: string): Promise<SearchResultPage> {
    const res = await request(app.getHttpServer())
      .get(`/search?${query}`)
      .set(...auth())
      .expect(200);
    return res.body as SearchResultPage;
  }

  it('matches a word inside a filename that has a dot-separated extension', async () => {
    const marker = `Quarterly${Date.now()}`;
    await createFile(`${marker}-report.pdf`, rootId);

    const page = await search(`q=${marker}`);
    expect(
      page.items.some((item) => item.name === `${marker}-report.pdf`),
    ).toBe(true);
  });

  it('ranks a name that is mostly the query term above one where the term is a small fragment', async () => {
    const marker = `Invoice${Date.now()}`;
    // Same word count of matches, but the first name is much shorter/more focused on the term.
    const focused = await createFile(`${marker}.txt`, rootId);
    const diluted = await createFile(
      `${marker} old draft copy backup archive misc notes.txt`,
      rootId,
    );

    const page = await search(`q=${marker}`);
    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(focused.id);
    expect(ids).toContain(diluted.id);
    expect(ids.indexOf(focused.id)).toBeLessThan(ids.indexOf(diluted.id));
  });

  it('filters by type', async () => {
    const marker = `Typed${Date.now()}`;
    const folder = await createFolder(`${marker}-Folder`, rootId);
    await createFile(`${marker}-File.txt`, rootId);

    const onlyFolders = await search(`q=${marker}&type=folder`);
    expect(onlyFolders.items.every((item) => item.type === 'folder')).toBe(
      true,
    );
    expect(onlyFolders.items.some((item) => item.id === folder.id)).toBe(true);

    const onlyFiles = await search(`q=${marker}&type=file`);
    expect(onlyFiles.items.every((item) => item.type === 'file')).toBe(true);
  });

  it('filters by date range', async () => {
    const marker = `Dated${Date.now()}`;
    await createFile(`${marker}.txt`, rootId);

    const farFuture = await search(
      `q=${marker}&dateFrom=2099-01-01&dateTo=2099-12-31`,
    );
    expect(farFuture.items).toHaveLength(0);

    const includesToday = await search(
      `q=${marker}&dateFrom=2020-01-01&dateTo=2099-12-31`,
    );
    expect(includesToday.items.length).toBeGreaterThan(0);
  });

  it('filters by tag', async () => {
    const marker = `Tagged${Date.now()}`;
    const tagged = await createFile(`${marker}-a.txt`, rootId);
    await createFile(`${marker}-b.txt`, rootId);

    const tagName = `project-${Date.now()}`;
    await request(app.getHttpServer())
      .put(`/files/${tagged.id}/tags`)
      .set(...auth())
      .send({ names: [tagName] })
      .expect(200);

    const untaggedResults = await search(`q=${marker}`);
    expect(untaggedResults.items.length).toBe(2);

    const taggedResults = await search(`q=${marker}&tag=${tagName}`);
    expect(taggedResults.items).toHaveLength(1);
    expect(taggedResults.items[0].id).toBe(tagged.id);
  });

  it('paginates results', async () => {
    const marker = `Paged${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await createFile(`${marker}-${i}.txt`, rootId);
    }

    const firstPage = await search(`q=${marker}&limit=2`);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await search(
      `q=${marker}&limit=2&cursor=${firstPage.nextCursor}`,
    );
    expect(secondPage.items.length).toBeGreaterThan(0);

    const firstIds = new Set(firstPage.items.map((item) => item.id));
    for (const item of secondPage.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });

  it('excludes trashed files from results', async () => {
    const marker = `Trashed${Date.now()}`;
    const file = await createFile(`${marker}.txt`, rootId);

    const before = await search(`q=${marker}`);
    expect(before.items.some((item) => item.id === file.id)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/files/${file.id}`)
      .set(...auth())
      .expect(204);

    const after = await search(`q=${marker}`);
    expect(after.items.some((item) => item.id === file.id)).toBe(false);
  });

  it('filters by folderId (restricts to a subtree)', async () => {
    const marker = `Scoped${Date.now()}`;
    const subfolder = await createFolder(`${marker}-Sub`, rootId);
    const inside = await createFile(`${marker}-inside.txt`, subfolder.id);
    await createFile(`${marker}-outside.txt`, rootId);

    const scoped = await search(`q=${marker}&folderId=${subfolder.id}`);
    expect(scoped.items.map((i) => i.id)).toContain(inside.id);
    expect(scoped.items.every((i) => i.id !== undefined)).toBe(true);
    expect(scoped.items.some((i) => i.name === `${marker}-outside.txt`)).toBe(
      false,
    );

    const unscoped = await search(`q=${marker}&type=file`);
    expect(unscoped.items.length).toBe(2);
  });

  it("never returns another user's files", async () => {
    const otherClerkId = `clerk-search-other-${Date.now()}`;
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
    const marker = `Isolated${Date.now()}`;
    const storageObject = await prisma.storageObject.create({
      data: {
        ownerId: other.id,
        bucket: 'novadrive-dev-test',
        objectKey: `stub/${other.id}/isolated`,
        contentType: 'text/plain',
        size: 1n,
        region: 'ap-south-1',
        uploadStatus: 'COMPLETED',
      },
    });
    await prisma.file.create({
      data: {
        name: `${marker}.txt`,
        ownerId: other.id,
        folderId: otherRoot.id,
        storageObjectId: storageObject.id,
      },
    });

    const results = await search(`q=${marker}`);
    expect(results.items).toHaveLength(0);

    await prisma.user.delete({ where: { id: other.id } });
  });
});
