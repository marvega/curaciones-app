import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface VerifiedToken {
  sub: string;
  scope: string;
  org_id: string;
  username?: string;
  org_name?: string;
  role?: string;
  exp: number;
}

export interface JwtVerifierConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export interface JwtVerifierDeps {
  jwks?: { getKey: JWTVerifyGetKey };
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export function createJwtVerifier(cfg: JwtVerifierConfig, deps: JwtVerifierDeps = {}): JwtVerifier {
  const jwks = deps.jwks?.getKey ?? createRemoteJWKSet(new URL(cfg.jwksUrl));

  return {
    async verify(token: string): Promise<VerifiedToken> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: cfg.issuer,
        audience: cfg.audience,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      const scope = typeof payload.scope === 'string' ? payload.scope : '';
      const orgId = typeof (payload as any).org_id === 'string' ? (payload as any).org_id : '';
      if (!sub || !orgId) {
        throw new Error('token missing required claims (sub, org_id)');
      }
      return {
        sub,
        scope,
        org_id: orgId,
        username: typeof (payload as any).username === 'string' ? (payload as any).username : undefined,
        org_name: typeof (payload as any).org_name === 'string' ? (payload as any).org_name : undefined,
        role: typeof (payload as any).role === 'string' ? (payload as any).role : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : 0,
      };
    },
  };
}
