import type { Folder } from '../../folders/domain/folder.entity';
import type { QuotaSubject } from './storage-quota.entity';

/** A quota subject is either the folder's owner (personal Drive) or its organization (a
 * workspace-scoped folder) — never a Workspace individually, since workspaces inside one org
 * share one pool. Resolved once, at upload-initiate time, and stamped onto the resulting
 * StorageObject — never re-derived later from wherever the content currently lives (see
 * docs/quota.md for why that matters once folders/files can move). */
export function resolveQuotaSubject(
  folder: Pick<Folder, 'ownerId' | 'organizationId'>,
): QuotaSubject {
  return folder.organizationId
    ? { subjectType: 'ORGANIZATION', subjectId: folder.organizationId }
    : { subjectType: 'USER', subjectId: folder.ownerId };
}
