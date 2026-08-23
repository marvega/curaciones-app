import { sign } from 'jsonwebtoken';
import { unverifiedIssuer } from './unverified-issuer';

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

describe('unverifiedIssuer', () => {
  it('reads iss out of a properly signed token', () => {
    const token = sign(
      { iss: 'https://api.curaciones.cl', sub: '1' },
      'secret',
    );
    expect(unverifiedIssuer(token)).toBe('https://api.curaciones.cl');
  });

  it('reads iss out of an unsigned token, on purpose', () => {
    // The point of the function: it answers "which verifier should look at
    // this", before anyone knows whether the token is real. An attacker
    // choosing this value only chooses who rejects them.
    const forged = `${b64({ alg: 'none' })}.${b64({ iss: 'https://api.curaciones.cl' })}.`;
    expect(unverifiedIssuer(forged)).toBe('https://api.curaciones.cl');
  });

  it('returns undefined when there is no iss claim', () => {
    // Internal SPA tokens: this is what routes them away from the OAuth path.
    expect(unverifiedIssuer(sign({ sub: 42 }, 'secret'))).toBeUndefined();
  });

  it('returns undefined for a non-string iss', () => {
    const odd = `${b64({ alg: 'none' })}.${b64({ iss: { $ne: null } })}.`;
    expect(unverifiedIssuer(odd)).toBeUndefined();
  });

  it.each([
    ['an empty string', ''],
    ['a single segment', 'abc'],
    ['two segments', 'abc.def'],
    ['four segments', 'a.b.c.d'],
    ['a non-base64 payload', 'aaa.!!!!.ccc'],
    ['a payload that is not JSON', `${b64({ alg: 'none' })}.bm90LWpzb24.sig`],
    [
      'a payload that is a JSON string',
      `${b64({ alg: 'none' })}.${b64('nope')}.sig`,
    ],
    ['a payload that is JSON null', `${b64({ alg: 'none' })}.${b64(null)}.sig`],
  ])('returns undefined for %s', (_label, token) => {
    expect(unverifiedIssuer(token)).toBeUndefined();
  });
});
