import { Workspace } from './workspace.entity';

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface CreateWorkspaceParams {
  organizationId: string;
  name: string;
}

export interface WorkspaceRepository {
  create(params: CreateWorkspaceParams): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  listForOrganization(organizationId: string): Promise<Workspace[]>;
  rename(id: string, name: string): Promise<Workspace>;
  /** Cascades (via the DB schema) to every Folder/File inside it — see DeleteWorkspaceUseCase. */
  delete(id: string): Promise<void>;
}
