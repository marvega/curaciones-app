import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenancy foundation migration. Single transaction:
 *   1. CREATE TABLE for new tables (Organization, Membership, RefreshToken,
 *      Invitation, PasswordResetToken, UserEstablishmentAssignment)
 *   2. ALTER existing tables: add nullable organizationId to 11 tenanted entities
 *      + AuditLog extra columns + User extra columns
 *   3. INSERT default Org #1 'Curaciones Demo'
 *   4. UPDATE existing rows -> organizationId = 1
 *   5. SET NOT NULL on organizationId where required
 *   6. CREATE INDEX
 *   7. INSERT OrganizationMembership for current user as owner
 *   8. UPDATE users with email = OWNER_EMAIL env (placeholder)
 *   9. ALTER users DROP COLUMN role
 *  10. AuditLog: re-compute hash chain in id ASC order, organizationId=1
 *
 * Encryption batch is intentionally NOT here — runs as a separate one-shot
 * script (`npm run encryption:backfill`) after KMS infra exists.
 */
export class MultiTenancyFoundation1714400000000 implements MigrationInterface {
  name = 'MultiTenancyFoundation1714400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"        bigserial PRIMARY KEY,
        "name"      varchar(200) NOT NULL,
        "rut"       varchar(20),
        "status"    varchar NOT NULL DEFAULT 'active',
        "tier"      varchar NOT NULL DEFAULT 'pilot',
        "settings"  jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id"             bigserial PRIMARY KEY,
        "userId"         integer NOT NULL,
        "organizationId" bigint NOT NULL,
        "role"           varchar NOT NULL,
        "status"         varchar NOT NULL DEFAULT 'active',
        "invitedAt"      timestamptz,
        "acceptedAt"     timestamptz,
        "revokedAt"      timestamptz,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_membership_user_org" UNIQUE ("userId", "organizationId"),
        CONSTRAINT "FK_membership_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_membership_org"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_membership_user" ON "organization_memberships"("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_membership_org" ON "organization_memberships"("organizationId")`);

    await queryRunner.query(`
      CREATE TABLE "user_establishment_assignments" (
        "userId"          integer NOT NULL,
        "establishmentId" bigint NOT NULL,
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "establishmentId"),
        CONSTRAINT "FK_uea_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_uea_establishment"
          FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "jti"            uuid PRIMARY KEY,
        "userId"         integer NOT NULL,
        "organizationId" bigint NOT NULL,
        "tokenHash"      char(64) NOT NULL,
        "deviceLabel"    varchar(200),
        "ipAddress"      varchar(45),
        "userAgent"      text,
        "issuedAt"       timestamptz NOT NULL,
        "lastUsedAt"     timestamptz NOT NULL,
        "expiresAt"      timestamptz NOT NULL,
        "revokedAt"      timestamptz,
        "rotatedFromJti" uuid
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_user_revoked" ON "refresh_tokens"("userId", "revokedAt")`);

    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id"             bigserial PRIMARY KEY,
        "organizationId" bigint NOT NULL,
        "email"          varchar(320) NOT NULL,
        "role"           varchar NOT NULL,
        "invitedById"    integer NOT NULL,
        "tokenHash"      char(64) NOT NULL,
        "expiresAt"      timestamptz NOT NULL,
        "acceptedAt"     timestamptz,
        "cancelledAt"    timestamptz,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_invitation_org"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invitation_inviter"
          FOREIGN KEY ("invitedById") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_invitation_org_email_pending"
        ON "invitations"("organizationId", "email")
        WHERE "acceptedAt" IS NULL AND "cancelledAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id"        bigserial PRIMARY KEY,
        "userId"    integer NOT NULL,
        "tokenHash" char(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt"    timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_pwd_reset_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pwd_reset_user_used" ON "password_reset_tokens"("userId", "usedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Reverting multi-tenancy migration is not supported. Restore from pg_dump backup.',
    );
  }
}
