import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../../users/domain/user.entity';
import type { AdminUserSummary } from '../../application/list-admin-users.use-case';

export class AdminUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  isSystemAdmin!: boolean;

  @ApiProperty()
  isSuspended!: boolean;

  @ApiProperty({ nullable: true })
  suspendedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  /** Only populated by endpoints that already looked quota up as part of their own work (the user
   * list and the quota-update endpoint) — suspend/unsuspend/system-role don't touch quota, so
   * they return a plain User with these left undefined rather than paying for an extra lookup
   * nothing asked for. */
  @ApiProperty({
    required: false,
    description: 'BigInt serialized as a string',
  })
  storageUsedBytes?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'null if this user has never attempted an upload',
  })
  storageLimitBytes?: string | null;

  static fromDomain(user: User | AdminUserSummary): AdminUserResponseDto {
    const dto = new AdminUserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.avatarUrl = user.avatarUrl;
    dto.isSystemAdmin = user.isSystemAdmin;
    dto.isSuspended = user.isSuspended;
    dto.suspendedAt = user.suspendedAt;
    dto.createdAt = user.createdAt;
    if ('storageUsedBytes' in user) {
      dto.storageUsedBytes = user.storageUsedBytes;
      dto.storageLimitBytes = user.storageLimitBytes;
    }
    return dto;
  }
}

export class AdminUserPageResponseDto {
  @ApiProperty({ type: [AdminUserResponseDto] })
  items!: AdminUserResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
