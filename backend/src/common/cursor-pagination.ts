/**
 * Opaque cursor for keyset pagination over `(createdAt DESC, id DESC)`.
 *
 * Encoding and decoding are deliberately asymmetric, and the types say so:
 * you encode from the `Date` TypeORM handed you, and you decode to the SQL
 * text that goes back into the keyset predicate. See `formatSqlTimestamp` for
 * why the conversion cannot be `Date.prototype.toISOString`.
 */

/** What a decoded cursor yields: `createdAt` is SQL timestamp text. */
export interface CursorPayload {
  id: number;
  createdAt: string;
}

/** What callers encode: `createdAt` is the entity's `@CreateDateColumn` value. */
export interface CursorInput {
  id: number;
  createdAt: Date;
}

/**
 * Render a `Date` as `timestamp without time zone` text — local wall clock,
 * no zone designator.
 *
 * Why not `toISOString()`. Every `createdAt` in this schema is
 * `timestamp without time zone`, and node-postgres materialises that type by
 * reading the column's wall-clock text *as process-local time*. `toISOString()`
 * is not the inverse of that read: it re-renders the instant in UTC, shifting
 * the text by the local offset. On a UTC host the two happen to coincide and
 * nothing looks wrong; on any other host — `America/Santiago`, where this is
 * developed and deployed, is UTC-4/-3 — the cursor carries a timestamp hours
 * ahead of every value in the column, `(createdAt, id) < (cursor…)` is
 * therefore true for every row, and the keyset stops excluding anything: every
 * page returns the first page, forever. An MCP client following `nextCursor`
 * loops until its own page budget runs out and never sees the older records.
 * That is silent data loss, not an error, which is why it survived a full unit
 * and controller suite — every one of those mocks the QueryBuilder.
 *
 * Formatting the local components back out is the exact inverse of the driver's
 * read, so the text handed to Postgres is byte-identical to what the column
 * holds and the comparison is host-independent.
 *
 * Known limitation: a JS `Date` carries milliseconds, the column carries
 * microseconds. The encoded value is therefore the row's timestamp truncated to
 * the millisecond, and a row sharing that millisecond with the last row of a
 * page but holding a smaller microsecond remainder sorts *after* the truncated
 * cursor and is skipped. Two rows must be inserted inside the same millisecond
 * for that to bite. Closing it properly means giving the keyset a domain the
 * cursor can represent exactly — either a `timestamp(3)` column or carrying the
 * DB's own timestamp text rather than a `Date` — both of which are schema/API
 * changes rather than a bug fix. Recorded here so the next reader knows the
 * bound rather than rediscovering it.
 */
function formatSqlTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    ` ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${p(d.getMilliseconds(), 3)}`
  );
}

export function encodeCursor(payload: CursorInput): string {
  const body: CursorPayload = {
    id: payload.id,
    createdAt: formatSqlTimestamp(payload.createdAt),
  };
  return Buffer.from(JSON.stringify(body)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.id !== 'number' || typeof parsed.createdAt !== 'string') {
      throw new Error('invalid cursor: missing fields');
    }
    return parsed as CursorPayload;
  } catch {
    throw new Error('invalid cursor');
  }
}
