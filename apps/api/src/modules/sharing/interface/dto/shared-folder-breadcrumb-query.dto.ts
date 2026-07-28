import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SharedFolderBreadcrumbQueryDto {
  @ApiPropertyOptional({
    description:
      "Which folder in the shared subtree to get the breadcrumb for — defaults to the link's own root folder.",
  })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({
    description: 'Required if the link is password-protected',
  })
  @IsOptional()
  @IsString()
  password?: string;
}
