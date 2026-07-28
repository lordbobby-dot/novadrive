import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RealtimeEmitter } from '../../realtime/realtime-emitter.service';
import { UPLOAD_PROGRESS } from '../domain/upload-events';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';

export interface ReportUploadPartParams {
  uploadId: string;
  ownerId: string;
  partNumber: number;
  eTag: string;
  size: string;
}

@Injectable()
export class ReportUploadPartUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  async execute(params: ReportUploadPartParams): Promise<void> {
    const session = await this.uploads.findById(
      params.uploadId,
      params.ownerId,
    );
    if (!session) {
      throw new NotFoundException('Upload not found');
    }
    if (session.status !== 'UPLOADING') {
      throw new BadRequestException(
        `Upload is not in progress (status: ${session.status})`,
      );
    }

    await this.uploads.addPart({
      storageObjectId: session.id,
      partNumber: params.partNumber,
      eTag: params.eTag,
      size: params.size,
    });

    const parts = await this.uploads.listParts(session.id);
    this.realtimeEmitter.emitToUser(params.ownerId, UPLOAD_PROGRESS, {
      uploadId: session.id,
      completedParts: parts.length,
      totalParts: session.totalParts,
    });
  }
}
