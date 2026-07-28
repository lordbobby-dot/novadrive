import { ApiProperty } from '@nestjs/swagger';
import { OrganizationMemberResponseDto } from '../../../organizations/interface/dto/organization-member-response.dto';
import { WorkspaceResponseDto } from '../../../organizations/interface/dto/workspace-response.dto';
import type { AdminOrganizationDetail } from '../../application/get-admin-organization-detail.use-case';
import { AdminOrganizationResponseDto } from './admin-organization-response.dto';

export class AdminOrganizationDetailResponseDto {
  @ApiProperty({ type: AdminOrganizationResponseDto })
  organization!: AdminOrganizationResponseDto;

  @ApiProperty({ type: [OrganizationMemberResponseDto] })
  members!: OrganizationMemberResponseDto[];

  @ApiProperty({ type: [WorkspaceResponseDto] })
  workspaces!: WorkspaceResponseDto[];

  static fromDomain(
    detail: AdminOrganizationDetail,
  ): AdminOrganizationDetailResponseDto {
    const dto = new AdminOrganizationDetailResponseDto();
    dto.organization = AdminOrganizationResponseDto.fromDomain(
      detail.organization,
    );
    dto.members = detail.members.map((m) =>
      OrganizationMemberResponseDto.fromDomain(m),
    );
    dto.workspaces = detail.workspaces.map((w) =>
      WorkspaceResponseDto.fromDomain(w),
    );
    return dto;
  }
}
