import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TransferOrganizationOwnershipDto {
  @ApiProperty({ description: 'User ID of the new owner' })
  @IsString()
  @IsNotEmpty()
  newOwnerId!: string;
}
