import { describe, it, expect } from 'vitest';
import {
  PROTECTED_RESOURCE_METADATA_PATH,
  bearerChallenge,
  buildProtectedResourceMetadata,
  protectedResourceMetadataUrl,
  supportedScopes,
} from './protected-resource-metadata.js';
import { TOOLS } from '../tools/catalog.js';

const RESOURCE = 'https://curaciones-mcp-abc123-uc.a.run.app';
const ISSUER = 'https://curaciones.web.app';

describe('protected resource metadata document', () => {
  const doc = buildProtectedResourceMetadata({ resource: RESOURCE, issuer: ISSUER });

  it('uses the well-known path RFC 9728 §3 defines', () => {
    expect(PROTECTED_RESOURCE_METADATA_PATH).toBe('/.well-known/oauth-protected-resource');
  });

  it('carries `resource`, the only REQUIRED field, as this server origin', () => {
    expect(doc.resource).toBe(RESOURCE);
  });

  it('points `authorization_servers` at the AS on the other origin', () => {
    // The regression this guards: an MCP client cannot discover a
    // cross-origin AS without this field.
    expect(doc.authorization_servers).toEqual([ISSUER]);
    expect(new URL(doc.authorization_servers[0]).origin).not.toBe(
      new URL(doc.resource).origin,
    );
  });

  it('advertises header-only bearer delivery and a human-readable name', () => {
    expect(doc.bearer_methods_supported).toEqual(['header']);
    expect(doc.resource_name).toBe('Curaciones MCP');
  });

  it('omits every field it cannot derive rather than inventing one', () => {
    expect(Object.keys(doc).sort()).toEqual([
      'authorization_servers',
      'bearer_methods_supported',
      'resource',
      'resource_name',
      'scopes_supported',
    ]);
  });
});

describe('supportedScopes', () => {
  it('covers exactly the scopes the tool catalog enforces, plus offline_access', () => {
    const fromCatalog = [...new Set(TOOLS.map((t) => t.requiredScope).filter(Boolean))].sort();
    expect(supportedScopes()).toEqual([...fromCatalog, 'offline_access']);
  });

  it('does not leak the scope-less whoami tool in as an empty string', () => {
    expect(supportedScopes()).not.toContain('');
  });
});

describe('bearerChallenge', () => {
  it('appends resource_metadata as a quoted string', () => {
    expect(bearerChallenge({ error: 'invalid_request' }, RESOURCE)).toBe(
      `Bearer error="invalid_request", resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`,
    );
  });

  it('keeps error_description ahead of resource_metadata', () => {
    const h = bearerChallenge(
      { error: 'invalid_token', error_description: 'jwt expired' },
      RESOURCE,
    );
    expect(h).toBe(
      'Bearer error="invalid_token", error_description="jwt expired", ' +
        `resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`,
    );
  });

  it('strips quotes and backslashes so a verifier message cannot break the header', () => {
    const h = bearerChallenge(
      { error: 'invalid_token', error_description: 'unexpected "aud" \\ claim' },
      RESOURCE,
    );
    // Exactly one quoted-string pair per parameter: 3 params -> 6 quotes.
    expect(h.match(/"/g)).toHaveLength(6);
    expect(h).toContain('error_description="unexpected aud  claim"');
  });

  it('builds the metadata URL by suffixing the origin', () => {
    expect(protectedResourceMetadataUrl(RESOURCE)).toBe(
      `${RESOURCE}/.well-known/oauth-protected-resource`,
    );
  });
});
