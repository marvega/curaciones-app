jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'JWKS_RESOLVER'),
  jwtVerify: jest.fn(),
}));

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GoogleOidcVerifier } from './google-oidc.verifier';

const mockVerify = jest.mocked(jwtVerify);
const mockJwks = jest.mocked(createRemoteJWKSet);

const AUD = 'https://api.example/api/internal/oauth-cleanup';

describe('GoogleOidcVerifier', () => {
  let verifier: GoogleOidcVerifier;

  beforeEach(() => {
    mockVerify.mockReset();
    mockJwks.mockClear();
    verifier = new GoogleOidcVerifier();
  });

  it('resolves keys against Google’s JWKS endpoint', async () => {
    mockVerify.mockResolvedValue({ payload: {} } as never);
    await verifier.verify('tok', AUD);
    expect(mockJwks).toHaveBeenCalledWith(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
    );
  });

  it('builds the remote key set once per instance', async () => {
    mockVerify.mockResolvedValue({ payload: {} } as never);
    await verifier.verify('tok', AUD);
    await verifier.verify('tok', AUD);
    expect(mockJwks).toHaveBeenCalledTimes(1);
  });

  it('pins the Google issuers and the caller-supplied audience', async () => {
    mockVerify.mockResolvedValue({
      payload: { email: 'a@b.iam.gserviceaccount.com' },
    } as never);
    await verifier.verify('tok', AUD);
    expect(mockVerify).toHaveBeenCalledWith('tok', 'JWKS_RESOLVER', {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: AUD,
    });
  });

  // Google has emitted the bare form too, and jose treats an `issuer` array as
  // "any match" (lib/jwt_claims_set.js:113 —
  // `!(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)`), so
  // listing it is what makes a token carrying it verifiable. The real jose
  // cannot run in this suite (ESM under a CommonJS Jest runtime), so this pins
  // the accepted set rather than re-testing jose's claim check.
  it.each(['https://accounts.google.com', 'accounts.google.com'])(
    'accepts the %s issuer form',
    async (iss) => {
      mockVerify.mockResolvedValue({
        payload: { iss, email: 'a@b.iam.gserviceaccount.com' },
      } as never);
      await verifier.verify('tok', AUD);
      const options = mockVerify.mock.calls[0][2] as { issuer: string[] };
      expect(options.issuer).toContain(iss);
    },
  );

  it('returns the email claim of a verified token', async () => {
    mockVerify.mockResolvedValue({
      payload: { email: 'a@b.iam.gserviceaccount.com' },
    } as never);
    await expect(verifier.verify('tok', AUD)).resolves.toEqual({
      email: 'a@b.iam.gserviceaccount.com',
    });
  });

  it.each([[undefined], [42], [null], [{ toString: () => 'x' }], [['a@b']]])(
    'drops a non-string email claim (%p) instead of coercing it',
    async (email) => {
      mockVerify.mockResolvedValue({ payload: { email } } as never);
      await expect(verifier.verify('tok', AUD)).resolves.toEqual({
        email: undefined,
      });
    },
  );

  // Bad signature, wrong `aud`, wrong `iss`, expired and structurally invalid
  // tokens all throw out of jose; the verifier must not swallow any of them.
  it('propagates verification failures to the caller', async () => {
    mockVerify.mockRejectedValue(new Error('signature verification failed'));
    await expect(verifier.verify('tok', AUD)).rejects.toThrow(
      'signature verification failed',
    );
  });
});
