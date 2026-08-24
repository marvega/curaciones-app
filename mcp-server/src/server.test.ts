import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server.js';
import type { Config } from './config.js';
import type { FastifyInstance } from 'fastify';

const RESOURCE = 'https://curaciones-mcp-abc123-uc.a.run.app';
const ISSUER = 'https://curaciones.web.app';

const cfg: Config = {
  port: 0,
  backendUrl: 'http://localhost:3000',
  resourceUrl: RESOURCE,
  oauth: { issuer: ISSUER, jwksUrl: `${ISSUER}/jwks.json`, audience: ISSUER },
  logLevel: 'error',
  nodeEnv: 'test',
};

describe('server', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer(cfg);
  });
  afterAll(async () => { await app.close(); });

  it('GET /health returns ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
    expect(typeof body.uptime).toBe('number');
  });
});

describe('protected resource metadata endpoint (RFC 9728)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildServer(cfg); });
  afterAll(async () => { await app.close(); });

  it('serves the document without a token', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    const body = r.json();
    expect(body.resource).toBe(RESOURCE);
    expect(body.authorization_servers).toEqual([ISSUER]);
    expect(body.scopes_supported).toContain('patients:read');
    expect(body.scopes_supported).toContain('offline_access');
  });

  it('does not alias the path-inserted URL, whose `resource` would not match', async () => {
    // RFC 9728 §3.3 ties the `resource` value to the URL the document was
    // fetched from; serving the origin document under `/…/mcp` would break it.
    const r = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource/mcp',
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('mcp endpoint', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildServer(cfg); });
  afterAll(async () => { await app.close(); });

  it('rejects MCP request without bearer with 401', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
    expect(r.headers['www-authenticate']).toMatch(/Bearer/);
  });

  it('points the 401 at the resource metadata document', async () => {
    // Without this parameter a conformant MCP client has no way to learn that
    // the AS lives on a different origin — the bug this pins.
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.headers['www-authenticate']).toBe(
      'Bearer error="invalid_request", ' +
        `resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`,
    );
  });

  it('also points there when the token is present but invalid', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer not-a-jwt' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
    const h = r.headers['www-authenticate'] as string;
    expect(h).toMatch(/^Bearer error="invalid_token"/);
    expect(h).toContain(
      `resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`,
    );
  });

  it('advertises a metadata URL the server actually answers on', async () => {
    // Closes the loop: follow the header the way a client would.
    const r401 = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    const url = /resource_metadata="([^"]+)"/.exec(
      r401.headers['www-authenticate'] as string,
    )![1];
    expect(url.startsWith(RESOURCE)).toBe(true);
    const r = await app.inject({ method: 'GET', url: url.slice(RESOURCE.length) });
    expect(r.statusCode).toBe(200);
    expect(r.json().resource).toBe(RESOURCE);
  });
});
