import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class SetOrganizationQuotaDto {
  @ApiProperty({
    description:
      'New storage limit in bytes, as a decimal string. Must be a positive integer.',
  })
  @IsNumberString({ no_symbols: true })
  limitBytes!: string;
}
