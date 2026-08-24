/**
 * Export the OpenAPI document for the backend to ./openapi.json.
 *
 * The MCP server (and any other downstream code generator) consumes this
 * artifact to produce TypeScript types and detect API drift in CI.
 *
 * Required env vars (the script bootstraps AppModule end-to-end, so any
 * resource AppModule touches at startup must be reachable / configured):
 *   - DATABASE_URL: a reachable Postgres. No queries are issued, but
 *     TypeOrmModule.forRoot opens a pool. Local dev/test DB is fine.
 *   - KMS_BACKEND=memory: skips AWS KMS so OAuthBootstrap (signing-key
 *     generation, runs in onApplicationBootstrap) doesn't reach the network.
 *   - OAUTH_ISSUER (optional, defaults to http://localhost:3000).
 *   - EMAIL_BACKEND=noop (optional but recommended): avoids loading the
 *     Resend client when no API key is set.
 *
 * Example:
 *   DATABASE_URL=postgresql://curaciones:curaciones@localhost:5433/curaciones_test \
 *   KMS_BACKEND=memory EMAIL_BACKEND=noop \
 *     npm run openapi:export
 *
 * Output: writes pretty-printed JSON to backend/openapi.json (gitignored).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });

  // Mirror the DocumentBuilder config used in src/main.ts so the exported
  // artifact matches what /api/docs serves in development.
  const config = new DocumentBuilder()
    .setTitle('Curaciones API')
    .setDescription('API for clinical wound care management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${out}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
