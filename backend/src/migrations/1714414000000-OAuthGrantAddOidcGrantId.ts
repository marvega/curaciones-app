import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `oidcGrantId` to `oauth_grant`.
 *
 * `oidc-provider` issues its own runtime grant id (a nanoid) when the
 * Authorization endpoint resolves consent. That id is what gets baked into
 * subsequent AccessToken / RefreshToken / AuthorizationCode rows via
 * `oauth_token.grantId`, but we never stored it on our durable
 * `oauth_grant` row. Without that link, server-side claim enrichment
 * (`extraTokenClaims`) has no way to resolve `org_id` / `role` from a
 * token alone — `Grant.organizationId` is set in-memory but is not in
 * oidc-provider's `IN_PAYLOAD`, so it is dropped on serialization.
 *
 * Storing the runtime grantId on `OAuthGrant` is the join point we need.
 */
export class OAuthGrantAddOidcGrantId1714414000000
  implements MigrationInterface
{
  name = 'OAuthGrantAddOidcGrantId1714414000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_grant"
      ADD COLUMN IF NOT EXISTS "oidcGrantId" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_grant" DROP COLUMN IF EXISTS "oidcGrantId"
    `);
  }
}
