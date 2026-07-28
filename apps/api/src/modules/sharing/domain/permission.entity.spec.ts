import { roleMeetsMinimum } from './permission.entity';

describe('roleMeetsMinimum', () => {
  it('returns true when the role exactly equals the minimum — "meets", not "exceeds"', () => {
    expect(roleMeetsMinimum('VIEWER', 'VIEWER')).toBe(true);
    expect(roleMeetsMinimum('EDITOR', 'EDITOR')).toBe(true);
  });

  it('returns true when the role outranks the minimum', () => {
    expect(roleMeetsMinimum('OWNER', 'VIEWER')).toBe(true);
    expect(roleMeetsMinimum('ADMIN', 'EDITOR')).toBe(true);
  });

  it('returns false when the role is below the minimum', () => {
    expect(roleMeetsMinimum('VIEWER', 'EDITOR')).toBe(false);
    expect(roleMeetsMinimum('GUEST', 'VIEWER')).toBe(false);
  });
});
