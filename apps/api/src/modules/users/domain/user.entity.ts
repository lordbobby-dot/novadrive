export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isSystemAdmin: boolean;
  isSuspended: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClerkUserAttributes {
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
