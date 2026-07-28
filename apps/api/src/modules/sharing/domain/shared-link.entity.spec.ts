import {
  isSharedLinkDownloadLimitReached,
  isSharedLinkExpired,
  type SharedLink,
} from './shared-link.entity';

function makeLink(overrides: Partial<SharedLink> = {}): SharedLink {
  return {
    id: 'link-1',
    resourceType: 'FILE',
    resourceId: 'file-1',
    token: 'tok_abc',
    ownerId: 'owner-1',
    passwordHash: null,
    expiresAt: null,
    maxDownloads: null,
    downloadCount: 0,
    canView: true,
    canDownload: true,
    canComment: false,
    canEdit: false,
    visibility: 'PRIVATE',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('isSharedLinkExpired', () => {
  it('is never expired when expiresAt is null', () => {
    expect(isSharedLinkExpired(makeLink({ expiresAt: null }))).toBe(false);
  });

  it('is expired once the clock reaches expiresAt (inclusive)', () => {
    const expiresAt = new Date('2026-01-01T00:00:00.000Z');
    expect(
      isSharedLinkExpired(
        makeLink({ expiresAt }),
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isSharedLinkExpired(
        makeLink({ expiresAt }),
        new Date('2026-01-01T00:00:00.001Z'),
      ),
    ).toBe(true);
  });

  it('is not expired before expiresAt', () => {
    const expiresAt = new Date('2026-01-01T00:00:00.000Z');
    expect(
      isSharedLinkExpired(
        makeLink({ expiresAt }),
        new Date('2025-12-31T23:59:59.999Z'),
      ),
    ).toBe(false);
  });
});

describe('isSharedLinkDownloadLimitReached', () => {
  it('is never reached when maxDownloads is null', () => {
    expect(
      isSharedLinkDownloadLimitReached(
        makeLink({ maxDownloads: null, downloadCount: 1_000_000 }),
      ),
    ).toBe(false);
  });

  it('is reached once downloadCount meets maxDownloads', () => {
    expect(
      isSharedLinkDownloadLimitReached(
        makeLink({ maxDownloads: 5, downloadCount: 5 }),
      ),
    ).toBe(true);
    expect(
      isSharedLinkDownloadLimitReached(
        makeLink({ maxDownloads: 5, downloadCount: 6 }),
      ),
    ).toBe(true);
  });

  it('is not reached below the limit', () => {
    expect(
      isSharedLinkDownloadLimitReached(
        makeLink({ maxDownloads: 5, downloadCount: 4 }),
      ),
    ).toBe(false);
  });
});
