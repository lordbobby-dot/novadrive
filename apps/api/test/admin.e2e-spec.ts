import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyToken } from '@clerk/backend';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { CLERK_CLIENT } from '../src/modules/auth/infrastructure/clerk-client.provider';
import { ChecksumVerificationProcessor } from '../src/modules/uploads/infrastructure/checksum-verification.processor';
import { S3_CLIENT } from '../src/modules/storage/infrastructure/s3-client.provider';
import type { S3Client } from '@aws-sdk/client-s3';

jest.mock('@clerk/backend', () => ({
  ...jest.requireActual<object>('@clerk/backend'),
  verifyToken: jest.fn(),
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;

interface AdminUserBody {
  id: string;
  email: string;
  isSystemAdmin: boolean;
  isSuspended: boolean;
  storageUsedBytes?: string;
  storageLimitBytes?: string | null;
}

interface AdminUserPageBody {
  items: AdminUserBody[];
  nextCursor: string | null;
}

interface AdminOrganizationBody {
  id: string;
  ownerId: string;
  memberCount: number;
  workspaceCount: number;
  storageUsedBytes: string;
  storageLimitBytes: string | null;
}

interface AdminOrganizationMemberBody {
  userId: string;
  role: string;
}

interface AdminOrganizationDetailBody {
  organization: AdminOrganizationBody;
  members: AdminOrganizationMemberBody[];
  workspaces: unknown[];
}

interface AuditLogBody {
  eventType: string;
  actorId: string | null;
  targetId: string | null;
}

interface AuditLogPageBody {
  items: AuditLogBody[];
}

interface SystemHealthBody {
  database: { status: string };
  redis: { status: string };
  s3: { status: string };
  queues: { name: string }[];
}

interface AnalyticsBody {
  totalUserCount: number;
  totalOrganizationCount: number;
  activeUserCount: number;
  windowDays: number;
}

describe('Admin (e2e): guard, user suspend/role management, orgs, audit logs, system health, analytics', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const adminClerkId = `clerk-admin-e2e-${Date.now()}`;
  const regularClerkId = `clerk-admin-regular-${Date.now()}`;
  const targetClerkId = `clerk-admin-target-${Date.now()}`;
  let adminId: string;
  let regularId: string;
  let targetId: string;
  let orgId: string;

  const banUser = jest.fn().mockResolvedValue({});
  const unbanUser = jest.fn().mockResolvedValue({});

  const authAs = (clerkId: string) => {
    mockedVerifyToken.mockResolvedValue({ sub: clerkId } as never);
    return ['Authorization', 'Bearer test-token'] as [string, string];
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLERK_CLIENT)
      .useValue({ users: { banUser, unbanUser, getUser: jest.fn() } })
      .compile();

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
    const admin = await prisma.user.create({
      data: {
        clerkId: adminClerkId,
        email: `${adminClerkId}@example.com`,
        isSystemAdmin: true,
      },
    });
    adminId = admin.id;
    const regular = await prisma.user.create({
      data: { clerkId: regularClerkId, email: `${regularClerkId}@example.com` },
    });
    regularId = regular.id;
    const target = await prisma.user.create({
      data: { clerkId: targetClerkId, email: `${targetClerkId}@example.com` },
    });
    targetId = target.id;

    const org = await prisma.organization.create({
      data: { name: `Admin E2E Org ${Date.now()}`, ownerId: adminId },
    });
    orgId = org.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.organization
      .delete({ where: { id: orgId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.user
      .delete({ where: { id: regularId } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: targetId } })
      .catch(() => undefined);
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  it('denies a non-admin on every /admin/* route (403, not a silent empty result)', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set(...authAs(regularClerkId))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/organizations')
      .set(...authAs(regularClerkId))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set(...authAs(regularClerkId))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/system-health')
      .set(...authAs(regularClerkId))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/analytics')
      .set(...authAs(regularClerkId))
      .expect(403);
  });

  it('lets an admin search and paginate users', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/users?search=${targetClerkId.slice(0, 10)}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const body = res.body as AdminUserPageBody;
    expect(body.items.some((u) => u.id === targetId)).toBe(true);
  });

  it('refuses to let an admin suspend their own account (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/suspend`)
      .set(...authAs(adminClerkId))
      .expect(400);
    expect(banUser).not.toHaveBeenCalled();
  });

  it('refuses to let an admin revoke their own system-admin role (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/system-role`)
      .set(...authAs(adminClerkId))
      .send({ isSystemAdmin: false })
      .expect(400);
  });

  it('suspends a target user — bans them in Clerk and immediately rejects their own requests', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/suspend`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect((res.body as AdminUserBody).isSuspended).toBe(true);
    expect(banUser).toHaveBeenCalledWith(targetClerkId);

    // The suspended user's own next request is rejected, even though their token is otherwise
    // perfectly valid — see AuthenticateWithClerkTokenUseCase's suspension check.
    await request(app.getHttpServer())
      .get('/users/me')
      .set(...authAs(targetClerkId))
      .expect(401);
  });

  it('is idempotent — suspending an already-suspended user does not re-ban', async () => {
    banUser.mockClear();
    await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/suspend`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect(banUser).not.toHaveBeenCalled();
  });

  it('unsuspends the target user — unbans them and restores access', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/unsuspend`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect((res.body as AdminUserBody).isSuspended).toBe(false);
    expect(unbanUser).toHaveBeenCalledWith(targetClerkId);

    await request(app.getHttpServer())
      .get('/users/me')
      .set(...authAs(targetClerkId))
      .expect(200);
  });

  it('grants and then revokes the system-admin role for another user', async () => {
    const grant = await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/system-role`)
      .set(...authAs(adminClerkId))
      .send({ isSystemAdmin: true })
      .expect(200);
    expect((grant.body as AdminUserBody).isSystemAdmin).toBe(true);

    // The newly-promoted admin can now reach an admin route themselves.
    await request(app.getHttpServer())
      .get('/admin/users')
      .set(...authAs(targetClerkId))
      .expect(200);

    const revoke = await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/system-role`)
      .set(...authAs(adminClerkId))
      .send({ isSystemAdmin: false })
      .expect(200);
    expect((revoke.body as AdminUserBody).isSystemAdmin).toBe(false);

    await request(app.getHttpServer())
      .get('/admin/users')
      .set(...authAs(targetClerkId))
      .expect(403);
  });

  it('lists users with a storage usage summary (null limit before any override)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/users?search=${targetClerkId.slice(0, 10)}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const target = (res.body as AdminUserPageBody).items.find(
      (u) => u.id === targetId,
    );
    expect(target?.storageUsedBytes).toBe('0');
    expect(target?.storageLimitBytes).toBeNull();
  });

  it('rejects a non-numeric, zero, or negative quota override (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: 'not-a-number' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '0' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '-5' })
      .expect(400);
  });

  it('404s when overriding quota for an unknown user', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/unknown-user-id/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '5000000000' })
      .expect(404);
  });

  it("overrides a user's storage quota and the new limit is reflected on the next list", async () => {
    const patch = await request(app.getHttpServer())
      .patch(`/admin/users/${targetId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '5000000000' })
      .expect(200);
    expect((patch.body as AdminUserBody).storageLimitBytes).toBe('5000000000');

    const res = await request(app.getHttpServer())
      .get(`/admin/users?search=${targetClerkId.slice(0, 10)}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const target = (res.body as AdminUserPageBody).items.find(
      (u) => u.id === targetId,
    );
    expect(target?.storageLimitBytes).toBe('5000000000');

    const auditRes = await request(app.getHttpServer())
      .get(`/admin/audit-logs?targetType=USER&actorId=${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const eventTypes = (auditRes.body as AuditLogPageBody).items
      .filter((entry) => entry.targetId === targetId)
      .map((entry) => entry.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining(['USER_QUOTA_UPDATED']));
  });

  it('lists organizations with member/workspace counts and a storage usage summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/organizations')
      .set(...authAs(adminClerkId))
      .expect(200);
    const org = (res.body as { items: AdminOrganizationBody[] }).items.find(
      (o) => o.id === orgId,
    );
    expect(org).toBeDefined();
    expect(org?.memberCount).toBeGreaterThanOrEqual(1);
    expect(org?.storageUsedBytes).toBe('0');
    expect(org?.storageLimitBytes).toBeNull();
  });

  it("gets a single organization's detail — members (owner included) and workspaces", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/organizations/${orgId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const body = res.body as AdminOrganizationDetailBody;
    expect(body.organization.id).toBe(orgId);
    expect(
      body.members.some((m) => m.userId === adminId && m.role === 'OWNER'),
    ).toBe(true);
  });

  it('404s getting detail for an unknown organization', async () => {
    await request(app.getHttpServer())
      .get('/admin/organizations/unknown-org-id')
      .set(...authAs(adminClerkId))
      .expect(404);
  });

  it('rejects a non-numeric, zero, or negative org quota override (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: 'nope' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '0' })
      .expect(400);
  });

  it("overrides an organization's storage quota, reflected on the next detail fetch, and audits ORGANIZATION_QUOTA_UPDATED", async () => {
    const patch = await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/quota`)
      .set(...authAs(adminClerkId))
      .send({ limitBytes: '10000000000' })
      .expect(200);
    expect((patch.body as AdminOrganizationBody).storageLimitBytes).toBe(
      '10000000000',
    );

    const detail = await request(app.getHttpServer())
      .get(`/admin/organizations/${orgId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect(
      (detail.body as AdminOrganizationDetailBody).organization
        .storageLimitBytes,
    ).toBe('10000000000');

    const auditRes = await request(app.getHttpServer())
      .get(`/admin/audit-logs?targetType=ORGANIZATION&actorId=${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const eventTypes = (auditRes.body as AuditLogPageBody).items
      .filter((entry) => entry.targetId === orgId)
      .map((entry) => entry.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(['ORGANIZATION_QUOTA_UPDATED']),
    );
  });

  it("changes and then removes a member's role directly, bypassing OrgRoleResolver, and audits both", async () => {
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: regularId, role: 'VIEWER' },
    });

    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/members/${regularId}`)
      .set(...authAs(adminClerkId))
      .send({ role: 'EDITOR' })
      .expect(204);

    const afterRoleChange = await request(app.getHttpServer())
      .get(`/admin/organizations/${orgId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect(
      (afterRoleChange.body as AdminOrganizationDetailBody).members.find(
        (m) => m.userId === regularId,
      )?.role,
    ).toBe('EDITOR');

    await request(app.getHttpServer())
      .delete(`/admin/organizations/${orgId}/members/${regularId}`)
      .set(...authAs(adminClerkId))
      .expect(204);

    const afterRemove = await request(app.getHttpServer())
      .get(`/admin/organizations/${orgId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    expect(
      (afterRemove.body as AdminOrganizationDetailBody).members.some(
        (m) => m.userId === regularId,
      ),
    ).toBe(false);

    const auditRes = await request(app.getHttpServer())
      .get(`/admin/audit-logs?targetType=ORGANIZATION&actorId=${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const eventTypes = (auditRes.body as AuditLogPageBody).items
      .filter((entry) => entry.targetId === orgId)
      .map((entry) => entry.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'ORGANIZATION_MEMBER_ROLE_CHANGED',
        'ORGANIZATION_MEMBER_REMOVED',
      ]),
    );
  });

  it("rejects setting a member's role to OWNER (400) and rejects targeting/removing the actual owner (400)", async () => {
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: targetId, role: 'VIEWER' },
    });

    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/members/${targetId}`)
      .set(...authAs(adminClerkId))
      .send({ role: 'OWNER' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/members/${adminId}`)
      .set(...authAs(adminClerkId))
      .send({ role: 'ADMIN' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/admin/organizations/${orgId}/members/${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(400);

    await prisma.organizationMember
      .deleteMany({ where: { organizationId: orgId, userId: targetId } })
      .catch(() => undefined);
  });

  it('transfers ownership to any existing user (even a non-member), downgrades the old owner to ADMIN, then deletes the organization', async () => {
    // A dedicated throwaway org, since this test ends by deleting it — the shared `orgId`
    // fixture (used by other tests and cleaned up in afterAll) must survive intact.
    const throwaway = await prisma.organization.create({
      data: { name: `Transfer E2E Org ${Date.now()}`, ownerId: adminId },
    });

    const transfer = await request(app.getHttpServer())
      .patch(`/admin/organizations/${throwaway.id}/owner`)
      .set(...authAs(adminClerkId))
      .send({ newOwnerId: regularId })
      .expect(200);
    expect((transfer.body as AdminOrganizationBody).ownerId).toBe(regularId);

    const detail = await request(app.getHttpServer())
      .get(`/admin/organizations/${throwaway.id}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const members = (detail.body as AdminOrganizationDetailBody).members;
    expect(
      members.some((m) => m.userId === regularId && m.role === 'OWNER'),
    ).toBe(true);
    expect(
      members.some((m) => m.userId === adminId && m.role === 'ADMIN'),
    ).toBe(true);

    const auditRes = await request(app.getHttpServer())
      .get(`/admin/audit-logs?targetType=ORGANIZATION&actorId=${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const transferEvents = (auditRes.body as AuditLogPageBody).items
      .filter((entry) => entry.targetId === throwaway.id)
      .map((entry) => entry.eventType);
    expect(transferEvents).toEqual(
      expect.arrayContaining(['ORGANIZATION_OWNER_TRANSFERRED']),
    );

    await request(app.getHttpServer())
      .delete(`/admin/organizations/${throwaway.id}`)
      .set(...authAs(adminClerkId))
      .expect(204);

    await request(app.getHttpServer())
      .get(`/admin/organizations/${throwaway.id}`)
      .set(...authAs(adminClerkId))
      .expect(404);
  });

  it('404s transferring ownership of an unknown organization, or to an unknown user', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/organizations/unknown-org-id/owner`)
      .set(...authAs(adminClerkId))
      .send({ newOwnerId: regularId })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/admin/organizations/${orgId}/owner`)
      .set(...authAs(adminClerkId))
      .send({ newOwnerId: 'unknown-user-id' })
      .expect(404);
  });

  it('404s deleting an unknown organization', async () => {
    await request(app.getHttpServer())
      .delete('/admin/organizations/unknown-org-id')
      .set(...authAs(adminClerkId))
      .expect(404);
  });

  it('lists audit logs and shows the suspend/unsuspend/role-change actions just performed', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/audit-logs?targetType=USER&actorId=${adminId}`)
      .set(...authAs(adminClerkId))
      .expect(200);
    const eventTypes = (res.body as AuditLogPageBody).items
      .filter((entry) => entry.targetId === targetId)
      .map((entry) => entry.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'USER_SUSPENDED',
        'USER_UNSUSPENDED',
        'ADMIN_ROLE_GRANTED',
        'ADMIN_ROLE_REVOKED',
      ]),
    );
  });

  it('reports system health for Postgres/Redis/S3 and both background-job queues', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/system-health')
      .set(...authAs(adminClerkId))
      .expect(200);
    const body = res.body as SystemHealthBody;
    expect(body.database.status).toBe('up');
    expect(body.redis.status).toBe('up');
    expect(body.queues.map((q) => q.name).sort()).toEqual([
      'checksum-verification',
      'trash-cleanup',
    ]);
  }, 15_000);

  it('reports analytics counts that include the fixtures created in this suite', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/analytics?windowDays=1')
      .set(...authAs(adminClerkId))
      .expect(200);
    const body = res.body as AnalyticsBody;
    expect(body.totalUserCount).toBeGreaterThanOrEqual(3);
    expect(body.totalOrganizationCount).toBeGreaterThanOrEqual(1);
    expect(body.windowDays).toBe(1);
  });
});
