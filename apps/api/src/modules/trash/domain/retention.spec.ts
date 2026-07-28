import { computeRetentionCutoff } from './retention';

describe('computeRetentionCutoff', () => {
  it('subtracts the retention window from now', () => {
    const now = new Date('2026-07-16T00:00:00.000Z');
    const cutoff = computeRetentionCutoff(now, 30);
    expect(cutoff.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });

  it('handles a zero-day window (nothing survives)', () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const cutoff = computeRetentionCutoff(now, 0);
    expect(cutoff.getTime()).toBe(now.getTime());
  });

  it('handles a one-day window', () => {
    const now = new Date('2026-07-16T00:00:00.000Z');
    const cutoff = computeRetentionCutoff(now, 1);
    expect(cutoff.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});
