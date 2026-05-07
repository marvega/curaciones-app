import { describe, it, expect } from 'vitest';
import { hasScope, type ScopeError } from './scope-check.js';

describe('hasScope', () => {
  it('returns null when scope is present', () => {
    expect(hasScope('patients:read agenda:read', 'patients:read')).toBeNull();
  });

  it('returns error when scope is missing', () => {
    const err = hasScope('patients:read', 'patients:write');
    expect(err).not.toBeNull();
    expect((err as ScopeError).requiredScope).toBe('patients:write');
  });

  it('handles empty scope string', () => {
    const err = hasScope('', 'patients:read');
    expect(err).not.toBeNull();
  });

  it('treats scope as exact match (no wildcard)', () => {
    expect(hasScope('patients', 'patients:read')).not.toBeNull();
  });
});
