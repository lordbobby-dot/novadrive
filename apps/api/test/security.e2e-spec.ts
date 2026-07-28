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

interface FolderBody {
  id: string;
  name: string;
}

/** A representative sweep of injection payloads against a handful of real user-text inputs —
 * not literally every field in the app, but enough surface (a raw-SQL-backed search query, a
 * Prisma-ORM-backed name field, and the global ValidationPipe's whitelist) to give confidence
 * the app's actual defenses (Prisma's parameterized queries — see docs/security.md's raw-query
 * audit — and React's default JSX escaping on the frontend) hold in practice, not just in
 * isolated unit tests. */
describe('Security: injection payload sweep (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerkId = `clerk-security-e2e-${Date.now()}`;
  let userId: string;
  let rootFolderId: string;

  const auth = () => ['Authorization', 'Bearer test-token'] as [string, string];

  const SQLI_PAYLOADS = [
    `'; DROP TABLE "User"; --`,
    `' OR '1'='1`,
    `1; SELECT pg_sleep(0)`,
  ];
  const XSS_PAYLOADS = [
    `<script>alert('xss')</script>`,
    `<img src=x onerror=alert(1)>`,
    `"><svg onload=alert(1)>`,
  ];

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
      data: { clerkId, email: `${clerkId}@example.com`, name: 'Security E2E' },
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
    await app.close();
  });

  it.each([...SQLI_PAYLOADS, ...XSS_PAYLOADS])(
    'stores a folder name containing %j as inert literal data, not executable content',
    async (payload) => {
      const created = await request(app.getHttpServer())
        .post('/folders')
        .set(...auth())
        .send({ name: payload, parentId: rootFolderId })
        .expect(201);
      const folder = created.body as FolderBody;
      // Prisma's parameterized queries mean the payload is just a string value — round-tripping
      // it unchanged (not stripped, not executed) is exactly the correct, safe behavior.
      expect(folder.name).toBe(payload);

      const fetched = await request(app.getHttpServer())
        .get(`/folders/${folder.id}`)
        .set(...auth())
        .expect(200);
      expect((fetched.body as FolderBody).name).toBe(payload);
    },
  );

  it('confirms the User table survives a SQLi payload sent as a folder name (no injection occurred)', async () => {
    await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({ name: `'; DROP TABLE "User"; --`, parentId: rootFolderId })
      .expect(201);

    // If the DROP TABLE had actually executed, this lookup (and every other request in this
    // suite) would fail with a Prisma "table does not exist" error instead of succeeding.
    const stillThere = await prisma.user.findUnique({ where: { id: userId } });
    expect(stillThere).not.toBeNull();
  });

  it.each([...SQLI_PAYLOADS, ...XSS_PAYLOADS])(
    'search query containing %j does not error and returns a well-formed page',
    async (payload) => {
      const res = await request(app.getHttpServer())
        .get(`/search?q=${encodeURIComponent(payload)}`)
        .set(...auth())
        .expect(200);
      const body = res.body as { items: unknown[]; nextCursor: string | null };
      expect(Array.isArray(body.items)).toBe(true);
    },
  );

  it('rejects a request body with an unexpected field (whitelist/forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/folders')
      .set(...auth())
      .send({
        name: 'whitelist-test',
        parentId: rootFolderId,
        isAdmin: true, // not a real DTO field — must be rejected, not silently dropped or applied
      })
      .expect(400);
  });
});
