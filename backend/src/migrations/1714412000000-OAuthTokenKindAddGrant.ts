import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `grant` to the `oauth_token_kind_enum`.
 *
 * Phase 6 introduces user consent: when a user approves a client, the
 * oidc-provider runtime instantiates a `Grant` model (its consent envelope
 * that authorization codes and access tokens reference via `grantId`). The
 * runtime persists Grant payloads through our `PostgresAdapter`, so the
 * `oauth_token.kind` enum needs a `grant` value.
 *
 * Note: this is the OIDC runtime's short-lived Grant — distinct from our
 * own `oauth_grant` table, which is the longer-lived consent record the
 * `ConsentService` writes for revocation/listing UIs.
 */
export class OAuthTokenKindAddGrant1714412000000 implements MigrationInterface {
  name = 'OAuthTokenKindAddGrant1714412000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres requires ALTER TYPE ... ADD VALUE outside of a transaction
    // when re-using the same value would error; running it idempotently here
    // is fine because each migration runs in its own transaction and the
    // value is added exactly once.
    await queryRunner.query(`
      ALTER TYPE "oauth_token_kind_enum" ADD VALUE IF NOT EXISTS 'grant'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres has no ALTER TYPE ... DROP VALUE. Reverting requires
    // recreating the enum and re-typing every column that uses it; we leave
    // `grant` in place on rollback to keep the migration symmetric-enough
    // without rewriting unrelated state.
  }
}
