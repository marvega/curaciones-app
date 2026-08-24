# Curaciones MCP Server

MCP server for the Curaciones platform. Exposes 19 tools v1 + `whoami` to Claude clients via OAuth 2.0, proxying all calls to the NestJS backend.

## Quickstart

1. Copy env: `cp .env.example .env` and adjust `BACKEND_URL` etc.
2. Install: `npm install`
3. Dev: `npm run dev` (watches src/, restarts on change)
4. Build + run: `npm run build && npm start`

## Endpoints

- `GET /health` — public, returns `{ status, version, uptime }`
- `GET /.well-known/oauth-protected-resource` — public, RFC 9728 protected resource metadata. `resource` is `MCP_RESOURCE_URL`, `authorization_servers` is `[OAUTH_ISSUER]`. This is how an MCP client discovers that the Authorization Server lives on a **different origin** than this server.
- `POST /mcp` — MCP streamable-HTTP, requires `Authorization: Bearer <jwt>` validated against `OAUTH_ISSUER` / `OAUTH_JWKS_URL`. Every 401 carries `WWW-Authenticate: Bearer …, resource_metadata="<MCP_RESOURCE_URL>/.well-known/oauth-protected-resource"`.

## Smoke test with MCP Inspector

```
npx @modelcontextprotocol/inspector
```

In the Inspector UI:
1. Set transport to "Streamable HTTP" pointing at `http://localhost:3001/mcp`
2. Set Authorization header to `Bearer <JWT>` (obtain via OAuth flow against the backend at `http://localhost:3000`)
3. Click "Connect" then "List Tools" → should see 20 tools
4. Test `whoami` first (no scope needed)
5. Test `search_patients` (requires `patients:read` scope)
6. Test `create_patient` (requires elicitation; Inspector will prompt for fields)

## Type regeneration

When the backend's OpenAPI changes:

```
cd mcp-server
./scripts/regenerate-api-types.sh
```

This calls `cd ../backend && npm run openapi:export`, then `npx openapi-typescript ../backend/openapi.json -o src/api-types/index.ts`.

CI fails the PR if the generated file drifts from committed.

## Tests

- Unit: `npm test`
- Integration (no backend): `npm run test:integration`
- Full integration (requires backend running with OAuth flow setup): `RUN_FULL_INTEGRATION=1 npm run test:integration`

## Architecture

See `docs/superpowers/specs/2026-05-07-mcp-server-design.md`.
