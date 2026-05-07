import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { OAuthClient } from '../entities/oauth-client.entity';
import type { AdapterPayload } from './postgres.adapter';

/**
 * oidc-provider Adapter for the `Client` model. Persists DCR-registered
 * clients to `oauth_client` and reconstitutes the metadata payload when
 * the provider fetches/destroys them.
 *
 * Mapping notes:
 * - oidc-provider treats `client_secret` as plaintext on read; we keep the
 *   plaintext in `metadata.client_secret` (jsonb) so DCR-issued clients can
 *   authenticate. Hashing remains a v2 concern (registered manual clients
 *   may use the dedicated `clientSecretHash` column).
 * - `registration_access_token` is stored as a separate `OAuthToken` row
 *   by the provider (kind=registration_access_token) — we mirror its hash
 *   into `oauth_client.registrationAccessTokenHash` for revocation lookups.
 */
export class ClientAdapter {
  constructor(private readonly repo: Repository<OAuthClient>) {}

  async upsert(id: string, payload: AdapterPayload, _expiresIn: number): Promise<void> {
    const p: any = payload;
    const ratHash = p.registration_access_token
      ? createHash('sha256').update(p.registration_access_token).digest('hex')
      : '';
    await this.repo.upsert(
      {
        clientId: id,
        clientSecretHash: null,
        clientName: (p.client_name as string) ?? id,
        clientUri: p.client_uri ?? null,
        logoUri: p.logo_uri ?? null,
        policyUri: p.policy_uri ?? null,
        tosUri: p.tos_uri ?? null,
        redirectUris: (p.redirect_uris as string[]) ?? [],
        grantTypes: (p.grant_types as string[]) ?? ['authorization_code', 'refresh_token'],
        responseTypes: (p.response_types as string[]) ?? ['code'],
        scope: (p.scope as string) ?? '',
        tokenEndpointAuthMethod: (p.token_endpoint_auth_method as any) ?? 'client_secret_basic',
        applicationType: (p.application_type as any) ?? 'web',
        softwareId: p.software_id ?? null,
        softwareVersion: p.software_version ?? null,
        // Stash the raw oidc-provider payload as metadata so `find` can
        // round-trip everything the provider serialized — including fields
        // we don't have first-class columns for (e.g. client_secret,
        // jwks, contacts, post_logout_redirect_uris).
        metadata: payload,
        registrationAccessTokenHash: ratHash,
      } as any,
      ['clientId'],
    );
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = await this.repo.findOne({ where: { clientId: id } });
    if (!row) return undefined;
    // The metadata column holds the original oidc-provider payload, which
    // is the canonical shape the provider expects on read.
    return row.metadata as AdapterPayload;
  }

  async destroy(id: string): Promise<void> {
    await this.repo.delete({ clientId: id });
  }

  // Methods required by the Adapter interface but unused for Client model.
  async findByUserCode(): Promise<AdapterPayload | undefined> { return undefined; }
  async findByUid(): Promise<AdapterPayload | undefined> { return undefined; }
  async consume(): Promise<void> { /* no-op for Client */ }
  async revokeByGrantId(): Promise<void> { /* no-op for Client */ }
}
