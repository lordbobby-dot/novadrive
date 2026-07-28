import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
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
}

interface FileBody {
  id: string;
  name: string;
}

interface PermissionBody {
  id: string;
  role: string;
  subjectId: string;
  subjectEmail: string | null;
  subjectName: string | null;
}

interface InvitationBody {
  id: string;
  email: string;
  status: string;
}

describe('Sharing (e2e): invite -> accept -> access, and direct grants', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const ownerClerkId = `clerk-sharing-owner-${Date.now()}`;
  const collaboratorClerkId = `clerk-sharing-collab-${Date.now()}`;
  const strangerClerkId = `clerk-sharing-stranger-${Date.now()}`;
  let ownerId: string;
  let collaboratorId: string;
  let strangerId: string;
  let ownerFolderId: string;
  let ownerFileId: string;

  const authAs = (clerkId: string) => {
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
    return ['Authorization', 'Bearer test-token'] as [string, string];
  };

  // The invitation's bearer token is deliberately never returned from POST /invitations (only
  // the emailed accept link carries it — see InvitationResponseDto) — so tests read it straight
  // from the database, standing in for "the invitee opened the email".
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

    const collaborator = await prisma.user.create({
      data: {
        clerkId: collaboratorClerkId,
        email: `${collaboratorClerkId}@example.com`,
        name: 'Collaborator',
      },
    });
    collaboratorId = collaborator.id;

    const stranger = await prisma.user.create({
      data: {
        clerkId: strangerClerkId,
        email: `${strangerClerkId}@example.com`,
        name: 'Stranger',
      },
    });
    strangerId = stranger.id;

    const root = await request(app.getHttpServer())
      .get('/folders/root')
      .set(...authAs(ownerClerkId))
      .expect(200);
    const rootFolderId = (root.body as FolderBody).id;

    const folder = await request(app.getHttpServer())
      .post('/folders')
      .set(...authAs(ownerClerkId))
      .send({ name: 'Shared Project', parentId: rootFolderId })
      .expect(201);
    ownerFolderId = (folder.body as FolderBody).id;

    const file = await createStubFile(prisma, {
      ownerId,
      folderId: ownerFolderId,
      name: 'brief.txt',
      contentType: 'text/plain',
      size: '10',
    });
    ownerFileId = file.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.permission.deleteMany({
      where: {
        OR: [{ resourceId: ownerFolderId }, { resourceId: ownerFileId }],
      },
    });
    await prisma.invitation.deleteMany({ where: { invitedBy: ownerId } });
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user
      .delete({ where: { id: collaboratorId } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: strangerId } })
      .catch(() => undefined);
    await app.close();
  });

  it('denies access to an uninvited stranger (PermissionGuard 403s, not 404)', async () => {
    await request(app.getHttpServer())
      .get(`/files/${ownerFileId}`)
      .set(...authAs(strangerClerkId))
      .expect(403);
  });

  it('invite -> accept -> access: an invited collaborator gains the granted role after accepting', async () => {
    const collaboratorEmail = `${collaboratorClerkId}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: collaboratorEmail,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'EDITOR',
      })
      .expect(201);

    // Before accepting, the collaborator still has no access.
    await request(app.getHttpServer())
      .get(`/files/${ownerFileId}`)
      .set(...authAs(collaboratorClerkId))
      .expect(403);

    const token = await latestInvitationToken(collaboratorEmail, ownerFolderId);
    const accept = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(collaboratorClerkId))
      .expect(201);
    expect((accept.body as PermissionBody).role).toBe('EDITOR');

    // After accepting, the collaborator can view the file inside the shared folder...
    const fileRes = await request(app.getHttpServer())
      .get(`/files/${ownerFileId}`)
      .set(...authAs(collaboratorClerkId))
      .expect(200);
    expect((fileRes.body as FileBody).name).toBe('brief.txt');

    // ...and, being EDITOR+, can rename it.
    await request(app.getHttpServer())
      .patch(`/files/${ownerFileId}/rename`)
      .set(...authAs(collaboratorClerkId))
      .send({ name: 'renamed-by-collaborator.txt' })
      .expect(200);
  });

  it('rejects an ADMIN-level collaborator inviting someone as OWNER (escalation guard), but allows the actual owner to', async () => {
    await request(app.getHttpServer())
      .post('/permissions')
      .set(...authAs(ownerClerkId))
      .send({
        subjectId: collaboratorId,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'ADMIN',
      })
      .expect(201);

    const blockedEmail = `blocked-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(collaboratorClerkId))
      .send({
        email: blockedEmail,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'OWNER',
      })
      .expect(403);
    await expect(
      prisma.invitation.findFirst({ where: { email: blockedEmail } }),
    ).resolves.toBeNull();

    const ownerInvitedEmail = `owner-invited-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: ownerInvitedEmail,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'OWNER',
      })
      .expect(201);
  });

  it('rejects re-accepting an invitation sent to a different email', async () => {
    const strangerEmail = `${strangerClerkId}@example.com`;
    await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: strangerEmail,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'VIEWER',
      })
      .expect(201);
    const token = await latestInvitationToken(strangerEmail, ownerFolderId);

    await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(collaboratorClerkId))
      .expect(403);
  });

  it('lists pending invitations for a resource and lets the owner revoke one', async () => {
    const revokeeEmail = `revokee-${Date.now()}@example.com`;
    const created = await request(app.getHttpServer())
      .post('/invitations')
      .set(...authAs(ownerClerkId))
      .send({
        email: revokeeEmail,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'VIEWER',
      })
      .expect(201);
    const invitationId = (created.body as InvitationBody).id;

    const list = await request(app.getHttpServer())
      .get(`/resources/folder/${ownerFolderId}/invitations`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const pending = (list.body as InvitationBody[]).find(
      (i) => i.id === invitationId,
    );
    expect(pending).toBeDefined();
    expect(pending!.status).toBe('PENDING');

    await request(app.getHttpServer())
      .delete(`/invitations/${invitationId}`)
      .set(...authAs(ownerClerkId))
      .expect(204);

    const afterRevoke = await request(app.getHttpServer())
      .get(`/resources/folder/${ownerFolderId}/invitations`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const revoked = (afterRevoke.body as InvitationBody[]).find(
      (i) => i.id === invitationId,
    );
    expect(revoked!.status).toBe('REVOKED');

    // A revoked invitation's token can no longer be accepted.
    const token = await latestInvitationToken(revokeeEmail, ownerFolderId);
    mockedVerifyToken.mockResolvedValue({ sub: revokeeEmail } as never);
    const revokeeUser = await prisma.user.create({
      data: { clerkId: revokeeEmail, email: revokeeEmail, name: 'Revokee' },
    });
    await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set(...authAs(revokeeEmail))
      .expect(400);
    await prisma.user.delete({ where: { id: revokeeUser.id } });
  });

  it('direct grant: a collaborator with ADMIN cannot escalate their own access to OWNER', async () => {
    // The collaborator already has ADMIN on ownerFolderId from the escalation-guard test above.
    await request(app.getHttpServer())
      .post('/permissions')
      .set(...authAs(collaboratorClerkId))
      .send({
        subjectId: strangerId,
        resourceType: 'FOLDER',
        resourceId: ownerFolderId,
        role: 'OWNER',
      })
      .expect(403);
  });

  it('owner can revoke a collaborator’s permission, immediately cutting off access', async () => {
    const list = await request(app.getHttpServer())
      .get(`/resources/folder/${ownerFolderId}/permissions`)
      .set(...authAs(ownerClerkId))
      .expect(200);
    const grant = (list.body as PermissionBody[]).find(
      (p) => p.subjectId === collaboratorId,
    );
    expect(grant).toBeDefined();
    expect(grant!.subjectEmail).toBe(`${collaboratorClerkId}@example.com`);
    expect(grant!.subjectName).toBe('Collaborator');

    await request(app.getHttpServer())
      .delete(`/permissions/${grant!.id}`)
      .set(...authAs(ownerClerkId))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/files/${ownerFileId}`)
      .set(...authAs(collaboratorClerkId))
      .expect(403);
  });
});
