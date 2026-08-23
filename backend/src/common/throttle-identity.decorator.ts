import { SetMetadata } from '@nestjs/common';

export const THROTTLE_IDENTITY_KEY = 'throttle:anonymous-identity';

/**
 * Where a handler says the identity of an otherwise anonymous caller can be
 * read from.
 *
 * `body` is a single field name, not a list, so that a declaration reads as one
 * fact per source. `basic-auth-client-id` has no parameter because RFC 6749
 * §2.3.1 fixes the position: the user-id half of an HTTP Basic credential *is*
 * the client_id at the token endpoint.
 */
export type ThrottleIdentitySource =
  | { readonly kind: 'body'; readonly field: string }
  | { readonly kind: 'basic-auth-client-id' };

/** The value of a body field identifies the caller. */
export function bodyField(field: string): ThrottleIdentitySource {
  if (field.trim() === '') {
    throw new Error('bodyField() requires a field name');
  }
  return { kind: 'body', field };
}

/** The user-id half of an HTTP Basic credential identifies the caller. */
export function basicAuthClientId(): ThrottleIdentitySource {
  return { kind: 'basic-auth-client-id' };
}

/**
 * Declares what distinguishes one anonymous caller of *this* handler from
 * another, for rate-limiting purposes. Sources are tried in the order written;
 * the first that yields a non-empty string wins. A handler that declares
 * nothing is rate-limited per IP.
 *
 * Why the handler declares this instead of the guard discovering it. The guard
 * used to walk the request body looking for the first of a fixed list of field
 * names (`client_id`, `usernameOrEmail`, `email`, `refreshToken`, `token`, …)
 * and key the rate-limit bucket on whichever it found. Guards run before pipes,
 * so `ValidationPipe({ whitelist: true })` has not yet stripped anything by the
 * time the tracker is computed: adding `client_id` to a `POST /api/auth/login`
 * body — a field `LoginDto` does not declare and the handler never sees —
 * bought a fresh bucket per request. Measured on this branch before the change:
 * five logins carrying five random `client_id`s consumed five buckets, against
 * one for the same five logins without the field, which is the per-account
 * 5-per-minute login cap removed by typing eleven characters. The same trick on
 * `POST /oauth/register` turned the 10-per-hour dynamic-registration cap — the
 * only protection on a publicly writable table — into five buckets from five
 * requests.
 *
 * The defect was not the choice of field names; it was that the *caller* chose
 * which name counted. Here the route chooses, once, in source, and a field the
 * route did not name cannot influence the bucket no matter what a caller sends.
 *
 * What a declaration costs. The declared value is still caller-supplied, so a
 * caller can still mint buckets by rotating it — a login attempt per account, a
 * grant exchange per client_id. That is the intended shape: the declared field
 * is the identity the cap is meant to bound, so a fresh bucket only ever buys
 * an attacker a fresh attempt against a *different* target, never more attempts
 * against the same one. Per-account capping is preserved; per-caller capping
 * was never available behind a shared egress IP. Declare a field only where
 * that trade holds — which is why `POST /oauth/register`, every field of whose
 * body is caller-chosen and none of which names a pre-existing identity,
 * declares nothing and stays on the shared-IP bucket on purpose.
 */
export function ThrottleIdentity(
  ...sources: ThrottleIdentitySource[]
): MethodDecorator & ClassDecorator {
  if (sources.length === 0) {
    throw new Error(
      '@ThrottleIdentity() requires at least one source. A handler with no ' +
        'usable discriminator should carry no decorator at all, which is the ' +
        'documented way to ask for the per-IP bucket.',
    );
  }
  return SetMetadata(THROTTLE_IDENTITY_KEY, sources);
}
