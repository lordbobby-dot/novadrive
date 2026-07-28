import { resolveQuotaSubject } from './quota-subject.resolver';

describe('resolveQuotaSubject', () => {
  it('resolves to the folder owner for a personal (non-workspace) folder', () => {
    const subject = resolveQuotaSubject({
      ownerId: 'owner-1',
      organizationId: null,
    });
    expect(subject).toEqual({ subjectType: 'USER', subjectId: 'owner-1' });
  });

  it('resolves to the organization for a workspace-scoped folder', () => {
    const subject = resolveQuotaSubject({
      ownerId: 'creator-1',
      organizationId: 'org-1',
    });
    expect(subject).toEqual({
      subjectType: 'ORGANIZATION',
      subjectId: 'org-1',
    });
  });
});
