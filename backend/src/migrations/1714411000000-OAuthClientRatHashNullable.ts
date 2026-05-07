import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop NOT NULL on `oauth_client.registrationAccessTokenHash`.
 *
 * The Registration Access Token (RAT) issued by oidc-provider during DCR is
 * stored on the dedicated `RegistrationAccessToken` adapter (a row in
 * `oauth_token` with kind=`registration_access_token`), not on the client
 * payload that `ClientAdapter.upsert` receives. Mirroring the RAT hash on
 * `oauth_client` was aspirational; in practice the column was always written
 * as `''`. Make it nullable so we can record `null` honestly until/unless we
 * choose to mirror the hash via a dedicated hook.
 */
export class OAuthClientRatHashNullable1714411000000 implements MigrationInterface {
  name = 'OAuthClientRatHashNullable1714411000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_client"
        ALTER COLUMN "registrationAccessTokenHash" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_client"
        ALTER COLUMN "registrationAccessTokenHash" SET NOT NULL
    `);
  }
}
