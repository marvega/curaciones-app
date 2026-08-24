import { TOOLS } from '../tools/catalog.js';

/**
 * RFC 9728 (OAuth 2.0 Protected Resource Metadata) support.
 *
 * Why this exists: the Authorization Server lives on a different origin than
 * this resource server (the AS is behind Firebase Hosting on the app's own
 * origin; this server is a separate Cloud Run service). Nothing in an MCP
 * client's configuration says where the AS is, so without RFC 9728 discovery a
 * conformant client has no way to find it. MCP's authorization spec makes this
 * mandatory: "MCP servers MUST implement OAuth 2.0 Protected Resource Metadata
 * (RFC9728)" and "MCP servers MUST use the HTTP header WWW-Authenticate when
 * returning a 401 Unauthorized to indicate the location of the resource server
 * metadata URL".
 */

/**
 * RFC 9728 §3: "By default, the well-known URI string used is
 * `/.well-known/oauth-protected-resource`". Our resource identifier has no
 * path component, so the metadata URL is exactly the host plus this suffix —
 * no path insertion needed.
 *
 * Deliberately NOT also served at `/.well-known/oauth-protected-resource/mcp`:
 * RFC 9728 §3.3 requires the `resource` value in the response to be identical
 * to the resource identifier into which the well-known string was inserted, so
 * an alias at the path-inserted URL would have to advertise a different
 * `resource` than the one this server actually is. Clients reach the correct
 * URL from the `WWW-Authenticate` header, which is the mechanism the MCP spec
 * requires them to use.
 */
export const PROTECTED_RESOURCE_METADATA_PATH =
  '/.well-known/oauth-protected-resource';

/**
 * Scopes an authorization request must ask for to be useful against this
 * resource. Derived from the tool catalog rather than hardcoded so the document
 * cannot drift from what `hasScope` actually enforces. `whoami` carries
 * `requiredScope: ''` (no scope check) and is filtered out.
 *
 * `offline_access` is added on purpose: access tokens have a 10-minute TTL, and
 * the MCP SDK builds its authorization request from `scopes_supported`. Without
 * it in the list the client never asks for a refresh token and the user is sent
 * back through consent every ten minutes. It is a scope used in the
 * authorization request that obtains tokens for this resource, which is what
 * RFC 9728 defines `scopes_supported` to hold.
 */
export function supportedScopes(): string[] {
  const toolScopes = [...new Set(TOOLS.map((t) => t.requiredScope).filter(Boolean))];
  return [...toolScopes.sort(), 'offline_access'];
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
}

/**
 * Builds the metadata document.
 *
 * Emitted fields and why the rest are omitted:
 *   resource                  REQUIRED. This server's own resource identifier.
 *   authorization_servers     Where the AS lives — the entire point here, and
 *                             the MCP spec requires at least one entry.
 *   scopes_supported          RECOMMENDED. See `supportedScopes`.
 *   bearer_methods_supported  Only `header` — `/mcp` reads the token from the
 *                             Authorization header and nowhere else.
 *   resource_name             RECOMMENDED. Shown by clients in consent UI.
 *
 * Omitted: `jwks_uri` (this resource signs nothing), `resource_documentation` /
 * `resource_policy_uri` / `resource_tos_uri` (no such URLs exist in this
 * system's configuration — inventing them would be worse than omitting an
 * OPTIONAL field), `resource_signing_alg_values_supported` (responses are not
 * signed), `tls_client_certificate_bound_access_tokens` and
 * `dpop_bound_access_tokens_required` (both default to false, which is
 * correct), `dpop_signing_alg_values_supported` (DPoP unsupported),
 * `authorization_details_types_supported` (RAR unsupported), `signed_metadata`
 * (would need a separate signing key).
 */
export function buildProtectedResourceMetadata(input: {
  resource: string;
  issuer: string;
}): ProtectedResourceMetadata {
  return {
    resource: input.resource,
    authorization_servers: [input.issuer],
    scopes_supported: supportedScopes(),
    bearer_methods_supported: ['header'],
    resource_name: 'Curaciones MCP',
  };
}

/** Absolute URL of the metadata document, for the `WWW-Authenticate` header. */
export function protectedResourceMetadataUrl(resource: string): string {
  return `${resource}${PROTECTED_RESOURCE_METADATA_PATH}`;
}

/**
 * Builds a `WWW-Authenticate` value with `resource_metadata` appended.
 *
 * RFC 9728 §5.1 shows the parameter as a quoted string; `error` /
 * `error_description` (RFC 6750 §3) are quoted the same way.
 */
export function bearerChallenge(
  params: Record<string, string>,
  resource: string,
): string {
  const all = {
    ...params,
    resource_metadata: protectedResourceMetadataUrl(resource),
  };
  const parts = Object.entries(all).map(
    // Backslash and double quote are the only characters a quoted-string
    // cannot carry literally; nothing else needs escaping.
    ([k, v]) => `${k}="${v.replace(/[\\"]/g, '')}"`,
  );
  return `Bearer ${parts.join(', ')}`;
}
