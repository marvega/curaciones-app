import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index `oauth_grant.oidcGrantId`.
 *
 * `extraTokenClaims` resolves `org_id` / `role` by looking up the durable
 * `OAuthGrant` row keyed by oidc-provider's runtime grant id (nanoid). That
 * lookup happens on every access-token issuance and refresh — it is a hot
 * read path that needs an index.
 */
export class OAuthGrantOidcGrantIdIndex1714415000000
  implements MigrationInterface
{
  name = 'OAuthGrantOidcGrantIdIndex1714415000000';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_oauth_grant_oidc_grant_id" ON oauth_grant ("oidcGrantId")`,
    );
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS "IDX_oauth_grant_oidc_grant_id"`);
  }
}
