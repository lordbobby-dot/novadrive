import { ForbiddenException } from '@nestjs/common';

/** Distinguished from a plain ForbiddenException/NotFoundException so the frontend can tell
 * "show a password prompt" apart from "this link doesn't exist or has expired" — both are 4xx,
 * but the UI response is completely different. */
export class SharedLinkPasswordRequiredException extends ForbiddenException {
  constructor() {
    super('This link is password-protected');
  }
}
