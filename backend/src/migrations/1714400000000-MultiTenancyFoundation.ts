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
    // implemented in next steps
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Reverting multi-tenancy migration is not supported. Restore from pg_dump backup.',
    );
  }
}
