import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OAuth 2.0 Authorization Server foundation migration.
 *
 * Creates 5 tables backing the OAuth Authorization Server:
 *   - oauth_client: registered OAuth clients (global, no org).
 *   - oauth_grant: persistent consent (one row per client+user+org+scope-set).
 *   - oauth_token: access/refresh/code/interaction artifacts of oidc-provider.
 *   - oauth_signing_key: RSA signing keys with KMS-encrypted private material.
 *   - oauth_revocation: small jti deny-list.
 *
 * Note on FK types: organizations.id is bigint (bigserial) and users.id is
 * integer in this codebase, so organizationId/userId on oauth_grant and
 * oauth_token use bigint/int respectively (not uuid as some specs imply).
 *
 * Deliberate FK omissions:
 *   - oauth_token.{grantId,clientId,userId,organizationId} have no FK because
 *     oidc-provider's lifecycle for these short-lived artifacts is decoupled
 *     from the entities; cascade deletes from those parents would race with
 *     in-flight token operations. ConnectedAppsService handles cascade
 *     manually when revoking grants.
 *   - oauth_revocation.userId has no FK so the deny-list survives any future
 *     soft-delete or merge of users (it's a security audit artifact).
 */
export class OAuthServer1714410000000 implements MigrationInterface {
  name = 'OAuthServer1714410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- oauth_client ---------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "oauth_token_endpoint_auth_method_enum" AS ENUM (
        'client_secret_basic', 'client_secret_post', 'none'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE "oauth_application_type_enum" AS ENUM ('web', 'native');
    `);
    await queryRunner.query(`
      CREATE TABLE "oauth_client" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "clientId" text NOT NULL UNIQUE,
        "clientSecretHash" text NULL,
        "clientName" text NOT NULL,
        "clientUri" text NULL,
        "logoUri" text NULL,
        "policyUri" text NULL,
        "tosUri" text NULL,
        "redirectUris" text[] NOT NULL,
        "grantTypes" text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token']::text[],
        "responseTypes" text[] NOT NULL DEFAULT ARRAY['code']::text[],
        "scope" text NOT NULL,
        "tokenEndpointAuthMethod" "oauth_token_endpoint_auth_method_enum" NOT NULL,
        "applicationType" "oauth_application_type_enum" NOT NULL DEFAULT 'web',
        "softwareId" text NULL,
        "softwareVersion" text NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "firstAuthorizedAt" timestamptz NULL,
        "registrationAccessTokenHash" text NOT NULL,
        "createdByIp" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_client_first_authorized" ON "oauth_client" ("firstAuthorizedAt");`,
    );

    // --- oauth_grant ----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "oauth_grant" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "clientId" text NOT NULL REFERENCES "oauth_client"("clientId") ON DELETE CASCADE,
        "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organizationId" bigint NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "scopes" text[] NOT NULL,
        "revokedAt" timestamptz NULL,
        "expiresAt" timestamptz NOT NULL,
        "lastUsedAt" timestamptz NULL,
        "archivedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_oauth_grant_active" ON "oauth_grant" ("clientId","userId","organizationId")
        WHERE "revokedAt" IS NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_grant_user" ON "oauth_grant" ("userId");`,
    );

    // --- oauth_token ----------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "oauth_token_kind_enum" AS ENUM (
        'access','refresh','authorization_code','interaction','session','registration_access_token'
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "oauth_token" (
        "id" text PRIMARY KEY,
        "kind" "oauth_token_kind_enum" NOT NULL,
        "payload" jsonb NOT NULL,
        "grantId" uuid NULL,
        "clientId" text NULL,
        "userId" int NULL,
        "organizationId" bigint NULL,
        "expiresAt" timestamptz NOT NULL,
        "consumed" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_token_grant" ON "oauth_token" ("grantId");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_token_kind_expires" ON "oauth_token" ("kind","expiresAt");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_token_user" ON "oauth_token" ("userId");`,
    );

    // --- oauth_signing_key ----------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "oauth_signing_key_status_enum" AS ENUM ('active','retired','revoked');
    `);
    await queryRunner.query(`
      CREATE TABLE "oauth_signing_key" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "algorithm" text NOT NULL,
        "publicKeyPem" text NOT NULL,
        "privateKeyEncrypted" bytea NOT NULL,
        "status" "oauth_signing_key_status_enum" NOT NULL,
        "activatedAt" timestamptz NULL,
        "retiredAt" timestamptz NULL,
        "revokedAt" timestamptz NULL,
        "retireScheduledAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_signing_key_status" ON "oauth_signing_key" ("status");`,
    );

    // --- oauth_revocation -----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "oauth_revocation" (
        "jti" text PRIMARY KEY,
        "userId" int NOT NULL,
        "reason" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_revocation_expires" ON "oauth_revocation" ("expiresAt");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oauth_revocation";`);

    await queryRunner.query(`DROP TABLE "oauth_signing_key";`);
    await queryRunner.query(`DROP TYPE "oauth_signing_key_status_enum";`);

    await queryRunner.query(`DROP TABLE "oauth_token";`);
    await queryRunner.query(`DROP TYPE "oauth_token_kind_enum";`);

    await queryRunner.query(`DROP TABLE "oauth_grant";`);

    await queryRunner.query(`DROP TABLE "oauth_client";`);
    await queryRunner.query(`DROP TYPE "oauth_application_type_enum";`);
    await queryRunner.query(`DROP TYPE "oauth_token_endpoint_auth_method_enum";`);
  }
}
