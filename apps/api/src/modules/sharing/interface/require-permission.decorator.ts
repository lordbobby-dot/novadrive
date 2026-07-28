import { SetMetadata } from '@nestjs/common';
import type {
  PermissionRoleName,
  ResourceTypeName,
} from '../domain/permission.entity';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface PermissionCheck {
  resourceType: ResourceTypeName;
  minimumRole: PermissionRoleName;
  /** Where to read the resource id from — most routes address the resource via `:id`; some
   * (create-under-parent, move/copy destinations, upload-initiate) need it from the request body;
   * list endpoints addressed by a query string (e.g. `GET /files?folderId=`) need it from there. */
  source: 'params' | 'body' | 'query';
  field: string;
  /** If true and the field is absent from the request, this check is skipped rather than
   * rejected — used for optional body fields like `versionOfFileId`. */
  optional?: boolean;
}

/** Stackable — pass one check per resource a route touches (e.g. move/copy need one check on the
 * source and one on the destination). PermissionGuard runs every check declared here; any
 * failure rejects the whole request. */
export function RequirePermission(...checks: PermissionCheck[]) {
  return SetMetadata(REQUIRE_PERMISSION_KEY, checks);
}
