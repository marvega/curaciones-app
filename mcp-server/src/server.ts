import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type Config } from './config.js';
import { createLogger } from './logging/logger.js';
import { correlationFromHeaders } from './logging/correlation.js';
import { createJwtVerifier, type VerifiedToken } from './auth/jwt-verifier.js';
import { createBackendClient } from './http/backend-client.js';
import { registerTools } from './tools/register.js';
import type { ToolContext } from './tools/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

interface RequestState {
  token: VerifiedToken;
  bearer: string;
  correlationId: string;
}

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const logger = createLogger({ level: cfg.logLevel });
  const app = Fastify({ loggerInstance: logger as any, disableRequestLogging: false });

  const verifier = createJwtVerifier({
    issuer: cfg.oauth.issuer,
    audience: cfg.oauth.audience,
    jwksUrl: cfg.oauth.jwksUrl,
  });
  const backend = createBackendClient({ backendUrl: cfg.backendUrl });

  // Per-request state holder used by registerTools.getContext.
  // The current request whose handler is running. Set by the /mcp route below.
  const requestStates = new WeakMap<FastifyRequest, RequestState>();
  let currentRequest: FastifyRequest | null = null;

  // Single MCP server with all tools registered.
  const mcp = new McpServer({ name: 'curaciones', version: pkg.version }, { capabilities: { tools: {} } });
  registerTools({
    server: mcp as any,
    getContext: (): ToolContext => {
      if (!currentRequest) throw new Error('No active request');
      const state = requestStates.get(currentRequest);
      if (!state) throw new Error('Request state missing');
      return { token: state.token, bearer: state.bearer, correlationId: state.correlationId, backend };
    },
  });

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
    requestStates.set(req as FastifyRequest, { token, bearer, correlationId });
    currentRequest = req;
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcp.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      currentRequest = null;
    }
  });

  return app;
}

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
