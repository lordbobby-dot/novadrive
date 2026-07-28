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

interface OrganizationBody {
  id: string;
  name: string;
}

interface WorkspaceBody {
  id: string;
  organizationId: string;
}

interface FolderBody {
  id: string;
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

describe('Search (e2e): workspace scope, owner filter, GET /recent, workspace anti-enumeration', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const ownerClerkId = `clerk-search-ws-owner-${Date.now()}`;
  const memberClerkId = `clerk-search-ws-member-${Date.now()}`;
  const outsiderClerkId = `clerk-search-ws-outsider-${Date.now()}`;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let orgId: string;
  let workspaceId: string;
  let workspaceRootId: string;

  const authAs = (clerkId: string) => {
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
    return ['Authorization', 'Bearer test-token'] as [string, string];
  };

  async function latestInvitationToken(
    email: string,
    resourceId: string,
  ): Promise<string> {
    const invitation = await prisma.invitation.findFirst({
      where: { email, resourceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) throw new Error('Invitation not found in DB');
    return invitation.token;
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
    const owner = await prisma.user.create({
      data: { clerkId: ownerClerkId, email: `${ownerClerkId}@example.com` },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { clerkId: memberClerkId, email: `${memberClerkId}@example.com` },
    });
    memberId = member.id;
    const outsider = await prisma.user.create({
      data: {
        clerkId: outsiderClerkId,
        email: `${outsiderClerkId}@example.com`,
      },
    });
    outsiderId = outsider.id;

    const org = await request(app.getHttpServer())
      .post('/organizations')
      .set(...authAs(ownerClerkId))
      .send({ name: 'Search Org' })
      .expect(201);
    orgId = (org.body as OrganizationBody).id;

    const workspace = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/workspaces`)
      .set(...authAs(ownerClerkId))
      .send({ name: 'Search Workspace' })
      .expect(201);
    workspaceId = (workspace.body as WorkspaceBody).id;

    const root = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/root-folder`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    workspaceRootId = (root.body as FolderBody).id;

    const memberEmail = `${memberClerkId}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: memberEmail,
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        role: 'EDITOR',
      })
      .expect(201);
    const token = await latestInvitationToken(memberEmail, orgId);
    await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(memberClerkId))
      .expect(201);
  }, 30_000);

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { invitedBy: ownerId } });
    await prisma.organization
      .deleteMany({ where: { ownerId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user
      .delete({ where: { id: memberId } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: outsiderId } })
      .catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  async function createFile(
    name: string,
    folderId: string,
    asUserId: string,
  ): Promise<FileBody> {
    return createStubFile(prisma, {
      ownerId: asUserId,
      folderId,
      name,
      contentType: 'text/plain',
      size: '10',
    });
  }

  it('finds a workspace file uploaded by another member — workspace search is not owner-scoped', async () => {
    const marker = `WsShared${Date.now()}`;
    await createFile(`${marker}.txt`, workspaceRootId, memberId);

    const res = await request(app.getHttpServer())
      .get(`/search?q=${marker}&workspaceId=${workspaceId}`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const page = res.body as SearchResultPage;
    expect(page.items.some((i) => i.name === `${marker}.txt`)).toBe(true);
  });

  it('filters a workspace search down to one owner via the owner param', async () => {
    const marker = `WsOwner${Date.now()}`;
    const ownerFile = await createFile(
      `${marker}-owner.txt`,
      workspaceRootId,
      ownerId,
    );
    await createFile(`${marker}-member.txt`, workspaceRootId, memberId);

    const res = await request(app.getHttpServer())
      .get(`/search?q=${marker}&workspaceId=${workspaceId}&owner=${ownerId}`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const page = res.body as SearchResultPage;
    expect(page.items.map((i) => i.id)).toEqual([ownerFile.id]);
  });

  it('rejects workspace search for a non-member (403)', async () => {
    await request(app.getHttpServer())
      .get(`/search?q=anything&workspaceId=${workspaceId}`)
      .set(...authAs(outsiderClerkId))
      .expect(403);
  });

  it('rejects workspace search for a nonexistent workspace the same way — anti-enumeration', async () => {
    const realButInaccessible = await request(app.getHttpServer())
      .get(`/search?q=anything&workspaceId=${workspaceId}`)
      .set(...authAs(outsiderClerkId))
      .expect(403);
    const nonexistent = await request(app.getHttpServer())
      .get(`/search?q=anything&workspaceId=does-not-exist`)
      .set(...authAs(outsiderClerkId))
      .expect(403);
    expect(nonexistent.status).toBe(realButInaccessible.status);
  });

  it('GET /recent rejects a non-member the same way for a real and a nonexistent workspace', async () => {
    await request(app.getHttpServer())
      .get(`/recent?workspaceId=${workspaceId}`)
      .set(...authAs(outsiderClerkId))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/recent?workspaceId=does-not-exist`)
      .set(...authAs(outsiderClerkId))
      .expect(403);
  });

  it('GET /recent (personal) reflects files after their download URL is issued, not on upload alone', async () => {
    const marker = `Recent${Date.now()}`;
    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...authAs(ownerClerkId))
      .expect(200);
    const rootId = (root.body as FolderBody).id;
    const file = await createFile(`${marker}.txt`, rootId, ownerId);

    const beforeAccess = await request(app.getHttpServer())
      .get('/recent')
      .set(...authAs(ownerClerkId))
      .expect(200);
    expect(
      (beforeAccess.body as SearchResultPage).items.some(
        (i) => i.id === file.id,
      ),
    ).toBe(false);

    await prisma.file.update({
      where: { id: file.id },
      data: { lastAccessedAt: new Date() },
    });

    const afterAccess = await request(app.getHttpServer())
      .get('/recent')
      .set(...authAs(ownerClerkId))
      .expect(200);
    expect(
      (afterAccess.body as SearchResultPage).items.some(
        (i) => i.id === file.id,
      ),
    ).toBe(true);
  });
});
