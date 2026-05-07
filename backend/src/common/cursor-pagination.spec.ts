import { encodeCursor, decodeCursor, CursorPayload } from './cursor-pagination';

describe('cursor-pagination', () => {
  it('round-trips a payload', () => {
    const payload: CursorPayload = { id: 42, createdAt: '2026-05-07T12:00:00.000Z' };
    const encoded = encodeCursor(payload);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('=');
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('returns null for missing cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('throws when decoded bytes are not valid JSON', () => {
    expect(() => decodeCursor('not-base64url!!!')).toThrow(/invalid cursor/i);
  });

  it('throws when payload is missing required fields', () => {
    const bad = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(/invalid cursor/i);
  });
});
