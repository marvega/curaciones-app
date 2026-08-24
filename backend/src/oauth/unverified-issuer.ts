/**
 * The `iss` claim of a JWT, read **without verifying the signature**.
 *
 * This is a routing hint and nothing else: it answers "which verifier should
 * look at this token", not "is this token good". An attacker can put any string
 * here, and the only thing that buys them is which verifier rejects them.
 * Nothing downstream of a call to this function may treat any other claim of
 * the same token as true — that is the mistake `OAuthClientThrottlerGuard` used
 * to make, taking `client_id` out of an unverified `decode()` and keying a
 * rate-limit bucket on it, which let a caller pick their own bucket with an
 * `alg:none` token.
 *
 * Extracted so that the one place the app decides "this token claims to be
 * ours" is shared between `MultiAuthGuard` (which then hands it to the real
 * verifier) and `OAuthClientThrottlerGuard` (which uses it to avoid loading the
 * JWKS for tokens that are plainly not OAuth ATs). Two copies of a rule about
 * unverified input is one copy too many.
 *
 * Returns undefined for anything that is not a three-part JWT with a JSON
 * object payload, which includes every malformed and truncated token.
 */
export function unverifiedIssuer(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    if (payload === null || typeof payload !== 'object') return undefined;
    const iss = (payload as Record<string, unknown>).iss;
    return typeof iss === 'string' ? iss : undefined;
  } catch {
    // Not base64url, not JSON — no issuer to route on.
    return undefined;
  }
}
