import { HttpException, HttpStatus } from '@nestjs/common';

/** 413 Payload Too Large — thrown by QuotaService.reserve before any S3 call is made, so an
 * over-quota upload never creates a multipart upload or presigns a single URL. */
export class QuotaExceededException extends HttpException {
  constructor(
    message = 'This upload would exceed the available storage quota',
  ) {
    super(message, HttpStatus.PAYLOAD_TOO_LARGE);
  }
}
