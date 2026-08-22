import { Injectable } from '@nestjs/common';
import type { JWTVerifyGetKey } from 'jose';

const GOOGLE_CERTS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
// Google has emitted both forms of `iss` for identity tokens. jose treats an
// array as "any match" (lib/jwt_claims_set.js: `issuer.includes(payload.iss)`),
// so accepting both costs nothing and avoids a permanent 401 tail on a job
// that runs once a day.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class GoogleOidcVerifier {
  // Cached across calls so the JWKS is fetched (and rotated) once per process
  // rather than once per request.
  private jwks?: JWTVerifyGetKey;

  async verify(token: string, audience: string): Promise<{ email?: string }> {
    // jose v6 ships ESM only. The backend compiles to CommonJS, and the Jest
    // runtimes refuse to require() an ES module, so the import has to be
    // dynamic — a static one breaks every suite that loads the module graph.
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    this.jwks ??= createRemoteJWKSet(GOOGLE_CERTS_URL);

    // Throws on a malformed token, an unknown signing key, a bad signature, a
    // wrong issuer, a wrong audience or an expired token. Callers must treat
    // any rejection as "not authorised".
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    return {
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  }
}
