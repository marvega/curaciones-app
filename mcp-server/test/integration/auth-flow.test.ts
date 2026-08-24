import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildServer } from '../../src/server.js';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

async function getTestBearer(): Promise<string> {
  const resp = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin' }),
  });
  if (!resp.ok) throw new Error(`Login failed: ${resp.status}`);
  const body = (await resp.json()) as { accessToken: string };
  return body.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 boundary tests — always run, no external deps.
// ─────────────────────────────────────────────────────────────────────────────
describe('auth flow — 401 boundary', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({
      port: 0,
      backendUrl: BACKEND,
      oauth: { issuer: BACKEND, jwksUrl: `${BACKEND}/jwks.json`, audience: BACKEND },
      logLevel: 'error',
      nodeEnv: 'test',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects /mcp without bearer', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
  });

  it('rejects /mcp with malformed bearer', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer not-a-jwt' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated /mcp flow against a local JWKS mock — tests the full transport
// stack (registerTools → MCP transport → tools/list response) without needing
// a real backend. Validates Phase 7.2 concerns #1 (SDK API) and #2 (lifecycle).
// ─────────────────────────────────────────────────────────────────────────────
describe('auth flow — authenticated /mcp via JWKS mock', () => {
  let jwksApp: FastifyInstance;
  let jwksUrl: string;
  let mcpApp: FastifyInstance;
  let signKey: CryptoKey;
  const issuer = 'http://test.issuer';
  const audience = 'http://test.issuer';

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey as CryptoKey;
    const publicJwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'int-test' };

    jwksApp = Fastify({ logger: false });
    jwksApp.get('/jwks.json', async () => ({ keys: [publicJwk] }));
    await jwksApp.listen({ port: 0, host: '127.0.0.1' });
    const addr = jwksApp.server.address();
    if (!addr || typeof addr === 'string') throw new Error('JWKS listen failed');
    jwksUrl = `http://127.0.0.1:${addr.port}/jwks.json`;

    mcpApp = await buildServer({
      port: 0,
      backendUrl: 'http://localhost:9999', // unused for tools/list
      oauth: { issuer, jwksUrl, audience },
      logLevel: 'error',
      nodeEnv: 'test',
    });
  });

  afterAll(async () => {
    await mcpApp.close();
    await jwksApp.close();
  });

  async function mintToken(scope = 'patients:read clinical:read inventory:read agenda:read reports:read'): Promise<string> {
    return await new SignJWT({
      iss: issuer,
      aud: audience,
      sub: '42',
      scope,
      org_id: '1',
      username: 'inttest',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'int-test' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signKey);
  }

  it('tools/list with valid bearer returns all 20 tools (concern #1: SDK API)', async () => {
    const bearer = await mintToken();
    const r = await mcpApp.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${bearer}`,
        accept: 'application/json, text/event-stream',
      },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(200);

    // The streamable HTTP transport may return SSE or plain JSON. Normalize.
    const body = parseRpcResponse(r.body);
    expect(body.result?.tools).toBeInstanceOf(Array);
    expect(body.result.tools.length).toBe(20);

    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toContain('whoami');
    expect(names).toContain('search_patients');
    expect(names).toContain('register_curacion');
    expect(names).toContain('monthly_report');
  });

  it('handles two consecutive authenticated requests (concern #2: transport lifecycle)', async () => {
    const bearer = await mintToken();
    for (let i = 0; i < 2; i++) {
      const r = await mcpApp.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${bearer}`,
          accept: 'application/json, text/event-stream',
        },
        payload: { jsonrpc: '2.0', method: 'tools/list', id: i + 1 },
      });
      expect(r.statusCode).toBe(200);
      const body = parseRpcResponse(r.body);
      expect(body.result?.tools?.length).toBe(20);
    }
  });

  it('handles concurrent authenticated requests without races (concern #3: per-request ctx)', async () => {
    const bearer = await mintToken();
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        mcpApp.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            authorization: `Bearer ${bearer}`,
            accept: 'application/json, text/event-stream',
          },
          payload: { jsonrpc: '2.0', method: 'tools/list', id: 100 + i },
        }),
      ),
    );
    for (const r of responses) {
      expect(r.statusCode).toBe(200);
      const body = parseRpcResponse(r.body);
      expect(body.result?.tools?.length).toBe(20);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optional full-integration tests — gated by env var, hit a real backend.
// ─────────────────────────────────────────────────────────────────────────────
describe('auth flow — full integration (real backend)', () => {
  let app: FastifyInstance;
  let bearer: string | undefined;

  beforeAll(async () => {
    if (!process.env.RUN_FULL_INTEGRATION) return;
    app = await buildServer({
      port: 0,
      backendUrl: BACKEND,
      oauth: { issuer: BACKEND, jwksUrl: `${BACKEND}/jwks.json`, audience: BACKEND },
      logLevel: 'error',
      nodeEnv: 'test',
    });
    try {
      bearer = await getTestBearer();
    } catch {
      // backend might not be running or creds invalid; tests below will throw
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it.skipIf(!process.env.RUN_FULL_INTEGRATION)('lists tools with bearer from real backend', async () => {
    if (!bearer) throw new Error('Bearer not obtained — backend probably not running or creds invalid');
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${bearer}`,
        accept: 'application/json, text/event-stream',
      },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(200);
    const body = parseRpcResponse(r.body);
    expect(body.result?.tools).toBeInstanceOf(Array);
    expect(body.result.tools.length).toBe(20);
  });
});

/**
 * The MCP streamable HTTP transport may respond with either:
 *  - application/json: a single JSON-RPC response object
 *  - text/event-stream: SSE frames whose `data:` lines carry the response
 */
function parseRpcResponse(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  // SSE frames — find the first `data: …` line that is JSON.
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try { return JSON.parse(payload); } catch { /* keep scanning */ }
      }
    }
  }
  throw new Error(`Could not parse RPC response: ${raw.slice(0, 200)}`);
}
