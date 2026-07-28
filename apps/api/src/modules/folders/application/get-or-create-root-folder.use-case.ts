import { Inject, Injectable } from '@nestjs/common';
import type { Folder } from '../domain/folder.entity';
import {
  FOLDER_REPOSITORY,
  type FolderRepository,
} from '../domain/folder.repository';

@Injectable()
export class GetOrCreateRootFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepository,
  ) {}

  async execute(ownerId: string): Promise<Folder> {
    const existing = await this.folders.findRoot(ownerId);
    if (existing) return existing;
    return this.folders.createRoot(ownerId);
  }
}
