import { ApiProperty } from '@nestjs/swagger';

export class PresignedPartDto {
  @ApiProperty()
  partNumber!: number;

  @ApiProperty()
  url!: string;
}
