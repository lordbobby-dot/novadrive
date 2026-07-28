import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import NodeClam from 'clamscan';
import type { EnvConfig } from '../../../config/env.validation';

export const CLAMAV_CLIENT = Symbol('CLAMAV_CLIENT');

/** Connects to the clamd sidecar (docker-compose service `clamav`) over plain TCP using clamd's
 * INSTREAM protocol — no local ClamAV binary needed in the API container. `bypassTest: true` so
 * a briefly-unreachable clamd (e.g. still downloading virus definitions on first boot, or a
 * rolling restart) doesn't take down the whole API at startup — a real connectivity problem
 * surfaces as a failed scan call instead, handled per-upload. See docs/security.md. */
export const ClamAvClientProvider: Provider = {
  provide: CLAMAV_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): Promise<NodeClam> =>
    new NodeClam().init({
      clamdscan: {
        host: config.get('CLAMAV_HOST', { infer: true }),
        port: config.get('CLAMAV_PORT', { infer: true }),
        active: true,
        localFallback: false,
        bypassTest: true,
      },
      clamscan: { active: false },
      preference: 'clamdscan',
    }),
};
