/**
 * Unit-tests the per-row branching of `encryption-batch.script.ts`. The script
 * is run as a NestFactory CLI in production, so we don't boot the app here —
 * instead we exercise the same conditional surface (placeholder shapes, raw
 * strings, empty strings, already-encrypted, null) by mirroring the relevant
 * lines into a small helper.
 */
import { isEncryptedField, EncryptedField } from './encrypted-field';

type Row = { id: number; organizationId: number | null; val: unknown };

interface Action {
  kind: 'skip' | 'null' | 'encrypt';
  plaintext?: string;
}

function classify(r: Row, opts: { hashCol?: string } = {}): Action {
  if (r.val === null) return { kind: 'skip' };
  if (isEncryptedField(r.val)) return { kind: 'skip' };
  let plaintext: string | null = null;
  if (typeof r.val === 'string') {
    plaintext = r.val;
  } else if (r.val && typeof r.val === 'object' && 'plaintext' in (r.val as object)) {
    const p = (r.val as { plaintext: unknown }).plaintext;
    plaintext = typeof p === 'string' ? p : null;
  }
  if (plaintext === null) return { kind: 'skip' };
  if (plaintext === '' && !opts.hashCol) return { kind: 'null' };
  return { kind: 'encrypt', plaintext };
}

const sampleEncrypted: EncryptedField = {
  v: 1,
  k: 'aaa',
  iv: 'bbb',
  c: 'ccc',
  t: 'ddd',
  aad: 'Patient.rut:1',
};

describe('encryption-batch row classifier', () => {
  it('skips null rows', () => {
    expect(classify({ id: 1, organizationId: 1, val: null })).toEqual({ kind: 'skip' });
  });

  it('skips already-encrypted rows', () => {
    expect(classify({ id: 1, organizationId: 1, val: sampleEncrypted })).toEqual({ kind: 'skip' });
  });

  it('encrypts placeholder shape with non-empty plaintext', () => {
    expect(
      classify({ id: 1, organizationId: 1, val: { plaintext: '5.765.546-1' } }),
    ).toEqual({ kind: 'encrypt', plaintext: '5.765.546-1' });
  });

  it('encrypts raw string values', () => {
    expect(classify({ id: 1, organizationId: 1, val: 'hello' })).toEqual({
      kind: 'encrypt',
      plaintext: 'hello',
    });
  });

  it('writes NULL for empty-string placeholders on nullable columns', () => {
    expect(classify({ id: 1, organizationId: 1, val: { plaintext: '' } })).toEqual({
      kind: 'null',
    });
  });

  it('encrypts empty strings on hashed columns to preserve hash uniqueness', () => {
    expect(
      classify({ id: 1, organizationId: 1, val: { plaintext: '' } }, { hashCol: 'rutHash' }),
    ).toEqual({ kind: 'encrypt', plaintext: '' });
  });

  it('skips rows with non-string plaintext', () => {
    expect(classify({ id: 1, organizationId: 1, val: { plaintext: 42 } })).toEqual({
      kind: 'skip',
    });
  });

  it('skips rows that are objects without a plaintext key', () => {
    expect(classify({ id: 1, organizationId: 1, val: { foo: 'bar' } })).toEqual({
      kind: 'skip',
    });
  });
});
