import { Inject, Injectable } from '@nestjs/common';
import type NodeClam from 'clamscan';
import type { Readable } from 'stream';
import { CLAMAV_CLIENT } from './clamav-client.provider';
import type {
  ScanResult,
  VirusScanAdapter,
} from '../domain/virus-scan-adapter';

@Injectable()
export class ClamAvScanAdapter implements VirusScanAdapter {
  constructor(@Inject(CLAMAV_CLIENT) private readonly clam: NodeClam) {}

  async scanStream(stream: NodeJS.ReadableStream): Promise<ScanResult> {
    const result = await this.clam.scanStream(stream as Readable);
    return { infected: result.isInfected, viruses: result.viruses };
  }
}
