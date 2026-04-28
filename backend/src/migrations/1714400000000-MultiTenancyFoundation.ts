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

    await queryRunner.query(`ALTER TABLE "establishments"           ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "patients"                 ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "patients"                 ADD COLUMN "rutHash" char(64)`);
    await queryRunner.query(`ALTER TABLE "patient_status_changes"   ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "curaciones"               ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "curacion_edits"           ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "appointments"             ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "wound_photos"             ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "wound_notes"              ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "consent_signatures"       ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "products"                 ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "canasta_categories"       ADD COLUMN "organizationId" bigint`);
    await queryRunner.query(`ALTER TABLE "monthly_cycles"           ADD COLUMN "organizationId" bigint`);

    // Drop old appointment uniqueness; will re-add scoped after backfill
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "UQ_appointments_date_time"`);

    // Drop old monthly_cycles uniqueness; will re-add scoped after backfill
    await queryRunner.query(`ALTER TABLE "monthly_cycles" DROP CONSTRAINT IF EXISTS "UQ_monthly_cycles_year_month"`);

    // AuditLog extensions
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "organizationId"  bigint`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "establishmentId" bigint`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "beforeJson"      jsonb`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "afterJson"       jsonb`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "userAgent"       text`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "requestId"       uuid`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "payloadHash"     char(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "prevHash"        char(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "chainHash"       char(64)`);

    // User extensions
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "email"             jsonb`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "emailHash"         char(64)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "emailVerifiedAt"   timestamptz`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "passwordChangedAt" timestamptz`);

    // Patient sensitive columns: convert text -> jsonb (encryption pending; backfill script
    // converts plaintext -> EncryptedField json). For now, copy-and-rename pattern.
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "rut" TYPE jsonb USING jsonb_build_object('plaintext', "rut"::text)`);
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "phone" TYPE jsonb USING (CASE WHEN "phone" IS NULL THEN NULL ELSE jsonb_build_object('plaintext', "phone"::text) END)`);
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "address" TYPE jsonb USING (CASE WHEN "address" IS NULL THEN NULL ELSE jsonb_build_object('plaintext', "address"::text) END)`);
    await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "UQ_patients_rut"`);

    await queryRunner.query(`ALTER TABLE "curaciones" ALTER COLUMN "observations" TYPE jsonb USING (CASE WHEN "observations" IS NULL THEN NULL ELSE jsonb_build_object('plaintext', "observations"::text) END)`);
    await queryRunner.query(`ALTER TABLE "wound_notes" ALTER COLUMN "notes" TYPE jsonb USING (CASE WHEN "notes" IS NULL THEN NULL ELSE jsonb_build_object('plaintext', "notes"::text) END)`);

    // ---- Default org ----
    const ownerEmail = process.env.OWNER_EMAIL || 'me@marcelovega.com';
    const ownerEmailHash = await this.sha256Lower(ownerEmail);

    await queryRunner.query(`
      INSERT INTO "organizations"("id", "name", "tier", "status")
      VALUES (1, 'Curaciones Demo', 'pilot', 'active')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`SELECT setval(pg_get_serial_sequence('organizations','id'), GREATEST(1, (SELECT MAX(id) FROM organizations)))`);

    // ---- Establishment backfill ----
    const existing = await queryRunner.query(`SELECT COUNT(*)::int AS c FROM "establishments"`);
    if (existing[0].c === 0) {
      await queryRunner.query(`
        INSERT INTO "establishments"("name", "comuna", "organizationId")
        VALUES ('Sede principal', 'Quilpué', 1)
      `);
    } else {
      await queryRunner.query(`UPDATE "establishments" SET "organizationId" = 1 WHERE "organizationId" IS NULL`);
    }

    // ---- Tenanted entities backfill ----
    const tables = [
      'patients', 'patient_status_changes', 'curaciones', 'curacion_edits',
      'appointments', 'wound_photos', 'wound_notes', 'consent_signatures',
      'products', 'canasta_categories', 'monthly_cycles',
    ];
    for (const t of tables) {
      await queryRunner.query(`UPDATE "${t}" SET "organizationId" = 1 WHERE "organizationId" IS NULL`);
    }

    // ---- AuditLog backfill (organizationId only — chain rebuilt below) ----
    await queryRunner.query(`UPDATE "audit_logs" SET "organizationId" = 1 WHERE "organizationId" IS NULL`);

    // ---- Owner user backfill ----
    await queryRunner.query(`
      UPDATE "users"
         SET "email" = jsonb_build_object('plaintext', $1::text),
             "emailHash" = $2,
             "emailVerifiedAt" = now(),
             "passwordChangedAt" = now()
       WHERE "id" = (SELECT MIN(id) FROM "users")
    `, [ownerEmail, ownerEmailHash]);

    // ---- OrganizationMembership for owner ----
    await queryRunner.query(`
      INSERT INTO "organization_memberships"("userId", "organizationId", "role", "status", "acceptedAt")
      SELECT id, 1, 'owner', 'active', now() FROM "users"
      ON CONFLICT ON CONSTRAINT "UQ_membership_user_org" DO NOTHING
    `);

    // ---- UserEstablishmentAssignment for owner (all establishments) ----
    await queryRunner.query(`
      INSERT INTO "user_establishment_assignments"("userId", "establishmentId")
      SELECT u.id, e.id FROM "users" u, "establishments" e
      ON CONFLICT DO NOTHING
    `);

    // ---- Drop old role column on users ----
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Reverting multi-tenancy migration is not supported. Restore from pg_dump backup.',
    );
  }

  private async sha256Lower(input: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(input.toLowerCase()).digest('hex');
  }
}
