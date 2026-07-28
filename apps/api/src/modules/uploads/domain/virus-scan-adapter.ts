export const VIRUS_SCAN_ADAPTER = Symbol('VIRUS_SCAN_ADAPTER');

export interface ScanResult {
  infected: boolean;
  viruses: string[];
}

export interface VirusScanAdapter {
  scanStream(stream: NodeJS.ReadableStream): Promise<ScanResult>;
}
