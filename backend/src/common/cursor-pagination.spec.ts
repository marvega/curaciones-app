import { encodeCursor, decodeCursor, CursorPayload } from './cursor-pagination';

describe('cursor-pagination', () => {
  it('round-trips a payload', () => {
    const createdAt = new Date(2026, 4, 7, 12, 0, 0, 0);
    const encoded = encodeCursor({ id: 42, createdAt });
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('=');
    expect(decodeCursor(encoded)).toEqual<CursorPayload>({
      id: 42,
      createdAt: '2026-05-07 12:00:00.000',
    });
  });

  /**
   * The bug this pins: `createdAt` columns are `timestamp without time zone`,
   * which node-postgres materialises by reading the column's wall-clock text as
   * process-local time. Encoding with `toISOString()` re-renders the instant in
   * UTC, so on any non-UTC host the cursor carried a timestamp offset from every
   * value in the column — hours ahead in `America/Santiago` — which made
   * `(createdAt, id) < (cursor…)` true for every row. The keyset then excluded
   * nothing and every page returned the first page.
   *
   * The encoded text must be the local wall clock, with no zone designator, so
   * it is byte-comparable with what the column holds on any host.
   */
  it('encodes local wall-clock text, not a UTC instant', () => {
    const createdAt = new Date(2026, 7, 23, 23, 42, 45, 675);
    const payload = decodeCursor(encodeCursor({ id: 1, createdAt }))!;

    expect(payload.createdAt).toBe('2026-08-23 23:42:45.675');
    expect(payload.createdAt).not.toContain('Z');
    expect(payload.createdAt).not.toContain('T');
    // The assertion that actually fails under the old implementation: on a host
    // with a non-zero UTC offset, `toISOString()` and the local wall clock
    // disagree, and it was the ISO form that used to be encoded.
    if (createdAt.getTimezoneOffset() !== 0) {
      expect(payload.createdAt).not.toBe(
        createdAt.toISOString().replace('T', ' ').replace('Z', ''),
      );
    }
  });

  it('pads every component to fixed width', () => {
    const payload = decodeCursor(
      encodeCursor({ id: 1, createdAt: new Date(2026, 0, 5, 4, 3, 2, 7) }),
    )!;
    expect(payload.createdAt).toBe('2026-01-05 04:03:02.007');
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
