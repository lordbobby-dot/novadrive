import { computeAbandonedUploadCutoff } from './staleness';

describe('computeAbandonedUploadCutoff', () => {
  it('subtracts the staleness window from now', () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const cutoff = computeAbandonedUploadCutoff(now, 24);
    expect(cutoff.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('handles a zero-hour window (nothing survives)', () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const cutoff = computeAbandonedUploadCutoff(now, 0);
    expect(cutoff.getTime()).toBe(now.getTime());
  });

  it('handles a sub-day window', () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const cutoff = computeAbandonedUploadCutoff(now, 1);
    expect(cutoff.toISOString()).toBe('2026-07-16T11:00:00.000Z');
  });
});
