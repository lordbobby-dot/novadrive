export interface AdminUserResponse {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isSystemAdmin: boolean;
  isSuspended: boolean;
  suspendedAt: string | null;
  createdAt: string;
  /** Present on the user list and the quota-update response; absent from suspend/unsuspend/
   * system-role responses, which don't touch quota. */
  storageUsedBytes?: string;
  storageLimitBytes?: string | null;
}

export interface AdminOrganizationResponse {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  workspaceCount: number;
  storageUsedBytes: string;
  storageLimitBytes: string | null;
  createdAt: string;
}

export interface AdminOrganizationMemberResponse {
  id: string;
  organizationId: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface AdminWorkspaceResponse {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrganizationDetailResponse {
  organization: AdminOrganizationResponse;
  members: AdminOrganizationMemberResponse[];
  workspaces: AdminWorkspaceResponse[];
}

export interface HealthCheckResult {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SystemHealthResponse {
  database: HealthCheckResult;
  redis: HealthCheckResult;
  s3: HealthCheckResult;
  queues: QueueMetrics[];
  checkedAt: string;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface DailyStorage {
  day: string;
  cumulativeBytes: string;
}

export interface AdminAnalyticsResponse {
  signupsByDay: DailyCount[];
  storageGrowthByDay: DailyStorage[];
  activeUserCount: number;
  totalUserCount: number;
  totalOrganizationCount: number;
  windowDays: number;
}
