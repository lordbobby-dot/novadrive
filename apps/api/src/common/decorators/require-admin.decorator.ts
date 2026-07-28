import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_ROUTE_KEY = 'isAdminRoute';

/** Marks a controller (or individual route) as requiring the platform-level isSystemAdmin role —
 * see AdminGuard, which is a global no-op everywhere this isn't applied, mirroring how
 * @RequirePermission opts routes into PermissionGuard. */
export const RequireAdmin = () => SetMetadata(IS_ADMIN_ROUTE_KEY, true);
