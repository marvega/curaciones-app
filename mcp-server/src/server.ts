import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, type Config } from './config.js';
import { createLogger } from './logging/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const logger = createLogger({ level: cfg.logLevel });
  const app = Fastify({ loggerInstance: logger as any, disableRequestLogging: true });

  app.get('/health', async () => ({
    status: 'ok',
    version: pkg.version,
    uptime: process.uptime(),
  }));

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
