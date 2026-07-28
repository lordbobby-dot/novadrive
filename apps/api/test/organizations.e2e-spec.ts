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

interface OrganizationBody {
  id: string;
  name: string;
  myRole: string;
}

interface WorkspaceBody {
  id: string;
  organizationId: string;
  name: string;
}

interface FolderBody {
  id: string;
  name: string;
  organizationId: string | null;
  workspaceId: string | null;
}

interface PermissionBody {
  id: string;
  role: string;
  resourceType: string;
  resourceId: string;
}

interface MemberBody {
  userId: string;
  role: string;
  email: string | null;
}

describe('Organizations (e2e): org/workspace CRUD, invite -> accept -> access, role enforcement', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const ownerClerkId = `clerk-org-owner-${Date.now()}`;
  const editorClerkId = `clerk-org-editor-${Date.now()}`;
  const viewerClerkId = `clerk-org-viewer-${Date.now()}`;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let orgId: string;
  let workspaceId: string;
  let workspaceRootFolderId: string;

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
      data: {
        clerkId: ownerClerkId,
        email: `${ownerClerkId}@example.com`,
        name: 'Owner',
      },
    });
    ownerId = owner.id;
    const editor = await prisma.user.create({
      data: {
        clerkId: editorClerkId,
        email: `${editorClerkId}@example.com`,
        name: 'Editor',
      },
    });
    editorId = editor.id;
    const viewer = await prisma.user.create({
      data: {
        clerkId: viewerClerkId,
        email: `${viewerClerkId}@example.com`,
        name: 'Viewer',
      },
    });
    viewerId = viewer.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { invitedBy: ownerId } });
    await prisma.organization
      .deleteMany({ where: { ownerId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user
      .delete({ where: { id: editorId } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: viewerId } })
      .catch(() => undefined);
    await app.close();
  });

  it('creates an organization with the creator as implicit OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set(...authAs(ownerClerkId))
      .send({ name: 'Acme Corp' })
      .expect(201);
    const body = res.body as OrganizationBody;
    expect(body.name).toBe('Acme Corp');
    expect(body.myRole).toBe('OWNER');
    orgId = body.id;
  });

  it('creates a workspace, which also creates its root folder', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/workspaces`)
      .set(...authAs(ownerClerkId))
      .send({ name: 'Engineering' })
      .expect(201);
    const body = res.body as WorkspaceBody;
    expect(body.organizationId).toBe(orgId);
    workspaceId = body.id;

    const root = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/root-folder`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const folder = root.body as FolderBody;
    expect(folder.organizationId).toBe(orgId);
    expect(folder.workspaceId).toBe(workspaceId);
    workspaceRootFolderId = folder.id;
  });

  it('denies an uninvited user access to the workspace root folder (403, not 404)', async () => {
    await request(app.getHttpServer())
      .get(`/folders/${workspaceRootFolderId}`)
      .set(...authAs(editorClerkId))
      .expect(403);
  });

  it('invite -> accept -> access: an org invite grants the workspace role after accepting', async () => {
    const editorEmail = `${editorClerkId}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: editorEmail,
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        role: 'EDITOR',
      })
      .expect(201);

    const token = await latestInvitationToken(editorEmail, orgId);
    const accept = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(editorClerkId))
      .expect(201);
    const permission = accept.body as PermissionBody;
    expect(permission.resourceType).toBe('ORGANIZATION');
    expect(permission.role).toBe('EDITOR');

    // Now has VIEWER+ access to the workspace root folder purely via org role — no explicit
    // Permission row was ever created on the folder itself.
    const folderRes = await request(app.getHttpServer())
      .get(`/folders/${workspaceRootFolderId}`)
      .set(...authAs(editorClerkId))
      .expect(200);
    expect((folderRes.body as FolderBody).id).toBe(workspaceRootFolderId);

    // Being EDITOR+, can create a subfolder inside the workspace — the new subfolder inherits
    // the workspace scope from its parent.
    const created = await request(app.getHttpServer())
      .post('/folders')
      .set(...authAs(editorClerkId))
      .send({ name: 'Sprint Notes', parentId: workspaceRootFolderId })
      .expect(201);
    const newFolder = created.body as FolderBody;
    expect(newFolder.organizationId).toBe(orgId);
    expect(newFolder.workspaceId).toBe(workspaceId);
  });

  it('a VIEWER-role org member can read but cannot create/edit workspace content', async () => {
    const viewerEmail = `${viewerClerkId}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: viewerEmail,
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        role: 'VIEWER',
      })
      .expect(201);
    const token = await latestInvitationToken(viewerEmail, orgId);
    await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(viewerClerkId))
      .expect(201);

    // Read access works.
    await request(app.getHttpServer())
      .get(`/folders/${workspaceRootFolderId}`)
      .set(...authAs(viewerClerkId))
      .expect(200);

    // Write access is rejected — VIEWER doesn't meet the EDITOR+ bar folder creation requires.
    await request(app.getHttpServer())
      .post('/folders')
      .set(...authAs(viewerClerkId))
      .send({ name: 'Should not be allowed', parentId: workspaceRootFolderId })
      .expect(403);
  });

  it('lists the organization for every member with their own resolved role', async () => {
    const ownerList = await request(app.getHttpServer())
      .get('/organizations')
      .set(...authAs(ownerClerkId))
      .expect(200);
    const ownerOrgs = ownerList.body as OrganizationBody[];
    expect(ownerOrgs.find((o) => o.id === orgId)?.myRole).toBe('OWNER');

    const editorList = await request(app.getHttpServer())
      .get('/organizations')
      .set(...authAs(editorClerkId))
      .expect(200);
    const editorOrgs = editorList.body as OrganizationBody[];
    expect(editorOrgs.find((o) => o.id === orgId)?.myRole).toBe('EDITOR');
  });

  it("lists members including the owner's synthetic OWNER entry", async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${orgId}/members`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const members = res.body as MemberBody[];
    expect(members.find((m) => m.userId === ownerId)?.role).toBe('OWNER');
    expect(members.find((m) => m.userId === editorId)?.role).toBe('EDITOR');
    expect(members.find((m) => m.userId === viewerId)?.role).toBe('VIEWER');
  });

  it("blocks a VIEWER from changing anyone's role or removing a member (ADMIN+ required)", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${orgId}/members/${editorId}`)
      .set(...authAs(viewerClerkId))
      .send({ role: 'VIEWER' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/organizations/${orgId}/members/${editorId}`)
      .set(...authAs(viewerClerkId))
      .expect(403);
  });

  it('refuses to remove or demote the organization owner', async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${orgId}/members/${ownerId}`)
      .set(...authAs(ownerClerkId))
      .send({ role: 'VIEWER' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/organizations/${orgId}/members/${ownerId}`)
      .set(...authAs(ownerClerkId))
      .expect(400);
  });

  it("the owner can change the viewer's role to ADMIN, and the promoted member can then invite others", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${orgId}/members/${viewerId}`)
      .set(...authAs(ownerClerkId))
      .send({ role: 'ADMIN' })
      .expect(200);

    const promotedEmail = `promoted-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(viewerClerkId))
      .send({
        email: promotedEmail,
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        role: 'VIEWER',
      })
      .expect(201);
  });
});
