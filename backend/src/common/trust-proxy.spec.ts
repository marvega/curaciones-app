import express from 'express';
import request from 'supertest';
import { DEFAULT_TRUST_PROXY_HOPS, resolveTrustProxyHops } from './trust-proxy';

describe('resolveTrustProxyHops', () => {
  it('defaults to 1 — the largest depth safe under every chain shape', () => {
    expect(resolveTrustProxyHops({})).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(DEFAULT_TRUST_PROXY_HOPS).toBe(1);
  });

  it('treats an empty value as unset', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '' })).toBe(1);
  });

  it('reads a configured depth', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '10' })).toBe(10);
  });

  it.each(['0', '-1', 'true', '1.5', 'two', '01'])(
    'throws on %p rather than degrading to NaN',
    (bad) => {
      expect(() => resolveTrustProxyHops({ TRUST_PROXY_HOPS: bad })).toThrow(
        /TRUST_PROXY_HOPS/,
      );
    },
  );
});

/**
 * These exercise Express/proxy-addr directly, because the defect lives in that
 * setting rather than in our own code. The chain below is what a container
 * behind one appending proxy sees when the caller planted a value of its own:
 * the caller's `192.0.2.1` on the left, the proxy's own append on the right.
 */
const PLANTED = '192.0.2.1';
const PROXY_APPENDED = '198.51.100.7';
const CHAIN = `${PLANTED}, ${PROXY_APPENDED}`;

function appWithTrustProxy(setting: unknown) {
  const app = express();
  app.set('trust proxy', setting);
  app.get('/', (req, res) => {
    res.json({ ip: req.ip, ips: req.ips, protocol: req.protocol });
  });
  return app;
}

describe('trust proxy and req.ip', () => {
  it('with `true`, req.ip is the value the caller planted (the bug)', async () => {
    const r = await request(appWithTrustProxy(true))
      .get('/')
      .set('x-forwarded-for', CHAIN);
    expect(r.body.ip).toBe(PLANTED);
  });

  it('with a hop count, req.ip is the proxy-appended value, not the planted one', async () => {
    const r = await request(appWithTrustProxy(DEFAULT_TRUST_PROXY_HOPS))
      .get('/')
      .set('x-forwarded-for', CHAIN);
    expect(r.body.ip).toBe(PROXY_APPENDED);
    expect(r.body.ip).not.toBe(PLANTED);
  });

  it('rotating the planted value cannot move req.ip — no rate-limit bypass', async () => {
    const app = appWithTrustProxy(DEFAULT_TRUST_PROXY_HOPS);
    const seen = new Set<string>();
    for (const planted of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      const r = await request(app)
        .get('/')
        .set('x-forwarded-for', `${planted}, ${PROXY_APPENDED}`);
      seen.add(r.body.ip);
    }
    expect([...seen]).toEqual([PROXY_APPENDED]);
  });

  it('still honours X-Forwarded-Proto, which the Secure cookie flag depends on', async () => {
    // A numeric setting trusts the socket peer, so forwarded-proto keeps
    // working. Regression guard for the Hosting TLS-termination fix.
    const r = await request(appWithTrustProxy(DEFAULT_TRUST_PROXY_HOPS))
      .get('/')
      .set('x-forwarded-for', CHAIN)
      .set('x-forwarded-proto', 'https');
    expect(r.body.protocol).toBe('https');
  });

  it('falls back to the socket peer when there is no forwarded chain', async () => {
    const r = await request(appWithTrustProxy(DEFAULT_TRUST_PROXY_HOPS)).get('/');
    expect(r.body.ip).toMatch(/127\.0\.0\.1|::ffff:127\.0\.0\.1|::1/);
  });
});
