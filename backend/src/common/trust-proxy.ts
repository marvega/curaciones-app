/**
 * How many reverse-proxy hops in front of this process are trustworthy.
 *
 * Why this is not `true`. Express's `trust proxy: true` trusts the whole
 * `X-Forwarded-For` chain, which makes `req.ip` the **left-most** element. Every
 * proxy in the chain *appends*, so the left-most element is whatever the first
 * caller sent — i.e. attacker-controlled. `PerUserThrottlerGuard.getTracker`
 * ends in `return req.ip`, so an unauthenticated caller could rotate
 * `X-Forwarded-For` and get a fresh rate-limit bucket per request. A numeric
 * value instead counts hops from the right, and a client can only ever prepend,
 * never append, so the value is structurally out of its reach.
 *
 * Why the default is 1. `proxy-addr` builds the candidate list as
 * `[socket peer, ...X-Forwarded-For reversed]` and a numeric `n` trusts the
 * first `n` entries, so `req.ip` is `candidates[n]`. With `n = 1` the only
 * trusted entry is the socket peer and `req.ip` is the right-most
 * `X-Forwarded-For` element — written by the last proxy before this container,
 * which is Google infrastructure in every reachable path (Firebase Hosting's
 * Fastly edge, the Cloud Run front end, or the Cloud Run front end alone when
 * the `*.run.app` URL is hit directly). That is the largest value that is safe
 * under *every* possible chain shape, and it was chosen instead of a larger
 * guess because the real depth could not be measured without deploying:
 *
 *   - If Hosting appends the client IP and the Cloud Run front end appends
 *     Hosting's egress IP, the chain has two infrastructure hops and `n = 2`
 *     would yield the true client IP.
 *   - If only one of them appends, `n = 2` yields a client-supplied value —
 *     the original bug, reintroduced.
 *
 * Since it cannot be told apart from here, the default is the value that is
 * correct in the first case and merely coarse in the second.
 *
 * Coarse is *not* free, and the comment that used to sit here — "every
 * authenticated request is already keyed on `user:<sub>`, so the IP path only
 * groups anonymous traffic" — got that exactly backwards. `firebase.json` routes
 * `/api/**` through Firebase Hosting, so at `n = 1` the right-most
 * `X-Forwarded-For` element is Hosting's egress address: the same value for
 * every user of the app. The routes with the tightest caps — login at 5/minute
 * in production, dynamic client registration at 10/hour — are unauthenticated by
 * definition, so `user:<sub>` never covers them and they were the ones sharing a
 * single bucket clinic-wide.
 *
 * That is fixed where it belongs, in the tracker rather than here:
 * `PerUserThrottlerGuard.anonymousTracker` discriminates anonymous callers by an
 * identifying field in the request body (the submitted username on login, the
 * `client_id` at the token endpoint) instead of by IP alone. What remains
 * IP-bound is dynamic client registration, whose request body is entirely
 * caller-chosen and so offers nothing trustworthy to key on.
 *
 * To raise it, measure first — see `GET /api/health/proxy`, which reports the
 * chain this process actually receives. Raising it is what finally makes the IP
 * component of those keys meaningful; until then it is carried but constant.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Reads `TRUST_PROXY_HOPS`. Throws on anything that is not a positive integer:
 * a typo must not silently degrade into `NaN`, which Express would treat as an
 * untrusted-everything setting and break `req.protocol` (and with it the
 * `Secure` flag on the `__session` cookie).
 */
export function resolveTrustProxyHops(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw === '') return DEFAULT_TRUST_PROXY_HOPS;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a positive integer, got '${raw}'. ` +
        `It is the number of trusted reverse-proxy hops in front of this ` +
        `process; omit it to use the default of ${DEFAULT_TRUST_PROXY_HOPS}.`,
    );
  }
  return Number(raw);
}
