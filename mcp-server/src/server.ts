import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type Config } from './config.js';
import { createLogger } from './logging/logger.js';
import { correlationFromHeaders } from './logging/correlation.js';
import { createJwtVerifier, type VerifiedToken } from './auth/jwt-verifier.js';
import { createBackendClient, type BackendClient } from './http/backend-client.js';
import { registerTools } from './tools/register.js';
import type { ToolContext } from './tools/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const logger = createLogger({ level: cfg.logLevel });
  const app = Fastify({ loggerInstance: logger as any, disableRequestLogging: false });

  const verifier = createJwtVerifier({
    issuer: cfg.oauth.issuer,
    audience: cfg.oauth.audience,
    jwksUrl: cfg.oauth.jwksUrl,
  });
  const backend = createBackendClient({ backendUrl: cfg.backendUrl });

  app.get('/health', async () => ({
    status: 'ok',
    version: pkg.version,
    uptime: process.uptime(),
  }));

  app.post('/mcp', async (req, reply) => {
    const auth = req.headers['authorization'];
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      reply.header('WWW-Authenticate', 'Bearer error="invalid_request"');
      return reply.code(401).send({ error: 'missing_bearer' });
    }
    const bearer = auth.slice(7);
    let token: VerifiedToken;
    try {
      token = await verifier.verify(bearer);
    } catch (e) {
      const msg = (e as Error).message.replace(/"/g, '');
      reply.header('WWW-Authenticate', `Bearer error="invalid_token", error_description="${msg}"`);
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const correlationId = correlationFromHeaders(req.headers as any);
    const ctx: ToolContext = { token, bearer, correlationId, backend };

    // Stateless transport mode requires a fresh transport (and, per the SDK,
    // a fresh Protocol/McpServer) per request. Reusing a single McpServer
    // throws "Already connected to a transport" on the second request.
    // Building per-request also makes ToolContext request-scoped via closure
    // — no module-level mutable state, no AsyncLocalStorage needed.
    const mcp = buildMcpServerForRequest(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Tell Fastify the response is taken over by the transport, which writes
    // directly to reply.raw. Without hijack, Fastify may try to also send.
    reply.hijack();

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      // Best-effort cleanup; ignore errors during teardown.
      try { await transport.close(); } catch { /* noop */ }
      try { await mcp.close(); } catch { /* noop */ }
    }
  });

  return app;
}

/**
 * Builds a fresh McpServer with all 20 tools registered, capturing the
 * per-request context in a closure. Cheap enough at request time because
 * tool registration only stores definitions.
 */
function buildMcpServerForRequest(ctx: ToolContext): McpServer {
  const mcp = new McpServer(
    { name: 'curaciones', version: pkg.version },
    { capabilities: { tools: {} } },
  );
  registerTools({
    server: mcp as unknown as Parameters<typeof registerTools>[0]['server'],
    getContext: () => ctx,
  });
  return mcp;
}

// Re-exported for tests/typing convenience.
export type { BackendClient };

async function main() {
  const cfg = loadConfig();
  const app = await buildServer(cfg);
  try {
    await app.listen({ port: cfg.port, host: '0.0.0.0' });
    app.log.info({ port: cfg.port }, 'mcp-server listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
