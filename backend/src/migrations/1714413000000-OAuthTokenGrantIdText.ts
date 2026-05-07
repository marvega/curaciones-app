import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loosen `oauth_token.grantId` from uuid to text.
 *
 * oidc-provider's `Grant` model identifiers are nanoids (43-char URL-safe
 * strings), not UUIDs. The original column type was overly strict and caused
 * `INSERT` failures when AuthorizationCode (and other token rows that
 * reference a grantId) try to persist after a successful consent.
 *
 * Note: this is the OIDC runtime grantId — distinct from our `oauth_grant.id`
 * column (which remains uuid).
 */
export class OAuthTokenGrantIdText1714413000000 implements MigrationInterface {
  name = 'OAuthTokenGrantIdText1714413000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_token"
        ALTER COLUMN "grantId" TYPE text USING "grantId"::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_token"
        ALTER COLUMN "grantId" TYPE uuid USING "grantId"::uuid
    `);
  }
}
