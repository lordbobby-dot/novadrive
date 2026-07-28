import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STORAGE_ADAPTER,
  type PresignedPart,
  type StorageAdapter,
} from '../../storage/domain/storage-adapter';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';

export interface PresignUploadPartsParams {
  uploadId: string;
  ownerId: string;
  partNumbers: number[];
}

@Injectable()
export class PresignUploadPartsUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async execute(params: PresignUploadPartsParams): Promise<PresignedPart[]> {
    const session = await this.uploads.findById(
      params.uploadId,
      params.ownerId,
    );
    if (!session) {
      throw new NotFoundException('Upload not found');
    }
    if (session.status !== 'UPLOADING' || !session.uploadId) {
      throw new BadRequestException(
        `Upload is not in progress (status: ${session.status})`,
      );
    }
    if (
      params.partNumbers.some(
        (partNumber) =>
          partNumber < 1 ||
          (session.totalParts !== null && partNumber > session.totalParts),
      )
    ) {
      throw new BadRequestException(
        'One or more part numbers are out of range',
      );
    }

    return this.storage.presignUploadParts({
      bucket: session.bucket,
      objectKey: session.objectKey,
      uploadId: session.uploadId,
      partNumbers: params.partNumbers,
    });
  }
}
