import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../domain/user.entity';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    description:
      'Platform-level admin role — grants access to /admin/*, distinct from any per-resource or organization role',
  })
  isSystemAdmin!: boolean;

  static fromDomain(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.avatarUrl = user.avatarUrl;
    dto.createdAt = user.createdAt;
    dto.isSystemAdmin = user.isSystemAdmin;
    return dto;
  }
}
