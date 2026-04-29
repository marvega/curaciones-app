# Multi-Tenancy Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce strict per-organization tenant isolation in the curaciones backend, with full auth lifecycle (refresh token rotation, invitation flow, password reset, change/logout/sessions), AWS KMS envelope encryption for sensitive PII, append-only hash-chain audit log, CLI provisioning of new orgs, and a production migration runbook.

**Architecture:** TypeORM subscriber + AsyncLocalStorage for request-scoped org context; envelope encryption with per-org DEKs cached in-memory for 1h; existing AuditLog table extended with `prevHash`/`chainHash` columns (no V2 table); Resend for transactional email; existing JWT mechanism extended with rotating refresh tokens stored server-side; org provisioning via CLI script (no public HTTP endpoint in v1).

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, Passport JWT, bcrypt, AWS KMS (`@aws-sdk/client-kms`), Resend (`resend` + `@react-email/render`), `react-email` for templates, React + Vite frontend, Jest + supertest for testing.

**Spec:** `docs/superpowers/specs/2026-04-28-multi-tenancy-foundation-design.md`
**Umbrella spec:** `docs/superpowers/specs/2026-04-28-multi-tenant-mcp-platform-umbrella.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/organizations/organization.entity.ts` | Create | Tenant root entity |
| `backend/src/organizations/organization-membership.entity.ts` | Create | M:N user↔org with role |
| `backend/src/organizations/organizations.module.ts` | Create | Wires Organization + Membership repos |
| `backend/src/organizations/organizations.service.ts` | Create | Org CRUD + membership ops |
| `backend/src/organizations/organizations.controller.ts` | Create | `/api/org/*` endpoints |
| `backend/src/organizations/index.ts` | Create | Barrel export |
| `backend/src/establishments/user-establishment-assignment.entity.ts` | Create | Per-user establishment scope |
| `backend/src/auth/refresh-token.entity.ts` | Create | Server-side refresh token rows |
| `backend/src/auth/invitation.entity.ts` | Create | Pending invites |
| `backend/src/auth/password-reset-token.entity.ts` | Create | Pending reset tokens |
| `backend/src/auth/auth.controller.ts` | Modify | Add 11 new endpoints (login already exists) |
| `backend/src/auth/auth.service.ts` | Modify | Refresh rotation, invitation, reset, change-pwd |
| `backend/src/auth/jwt.strategy.ts` | Modify | Validate org membership + passwordChangedAt |
| `backend/src/auth/auth.module.ts` | Modify | Wire new entities + services |
| `backend/src/auth/dto/*.dto.ts` | Create | DTOs for new endpoints |
| `backend/src/auth/sessions.service.ts` | Create | Refresh-token CRUD with rotation |
| `backend/src/auth/invitations.service.ts` | Create | Invitation create/preview/accept |
| `backend/src/auth/password-reset.service.ts` | Create | Forgot/reset flows |
| `backend/src/auth/refresh-token.guard.ts` | Create | Validates refresh-token JWTs |
| `backend/src/auth/require-role.decorator.ts` | Create | `@RequireRole('owner','admin')` |
| `backend/src/auth/role.guard.ts` | Create | Reads JWT role + checks |
| `backend/src/users/user.entity.ts` | Modify | +email, emailHash, emailVerifiedAt, passwordChangedAt; -role |
| `backend/src/establishments/establishment.entity.ts` | Modify | +organizationId |
| `backend/src/audit-log/audit-log.entity.ts` | Modify | +organizationId, +establishmentId, +userAgent, +requestId, +beforeJson, +afterJson, +payloadHash, +prevHash, +chainHash |
| `backend/src/audit-log/audit-log.interceptor.ts` | Modify | Capture before/after, hash chain insert |
| `backend/src/audit-log/audit-log.service.ts` | Modify | Atomic insert with FOR UPDATE |
| `backend/src/audit-log/audit-event.decorator.ts` | Create | `@AuditEvent('user.login.success')` |
| `backend/src/audit-log/audit-chain.service.ts` | Create | Hash compute helpers + verifier |
| `backend/src/patients/patient.entity.ts` | Modify | +organizationId |
| `backend/src/patients/patient-status-change.entity.ts` | Modify | +organizationId |
| `backend/src/curaciones/curacion.entity.ts` | Modify | +organizationId |
| `backend/src/curaciones/curacion-edit.entity.ts` | Modify | +organizationId |
| `backend/src/appointments/appointment.entity.ts` | Modify | +organizationId |
| `backend/src/wound-photos/wound-photo.entity.ts` | Modify | +organizationId |
| `backend/src/wound-notes/wound-note.entity.ts` | Modify | +organizationId |
| `backend/src/consent/consent-signature.entity.ts` | Modify | +organizationId |
| `backend/src/inventory/products/product.entity.ts` | Modify | +organizationId |
| `backend/src/inventory/canasta/canasta-category.entity.ts` | Modify | +organizationId |
| `backend/src/cycles/cycle.entity.ts` | Modify | +organizationId |
| `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts` | Create | Single big migration (schema + backfill + audit chain rebuild) |
| `backend/src/kms/kms.service.ts` | Create | `KmsService` interface |
| `backend/src/kms/aws-kms.service.ts` | Create | AWS KMS implementation |
| `backend/src/kms/in-memory-kms.service.ts` | Create | Test double |
| `backend/src/kms/encrypted-field.ts` | Create | `EncryptedField` type + JSON shape |
| `backend/src/kms/encrypted-column.transformer.ts` | Create | TypeORM column transformer |
| `backend/src/kms/kms.module.ts` | Create | Wires implementation by env |
| `backend/src/kms/encryption-batch.script.ts` | Create | One-shot CLI to encrypt v1 backfill |
| `backend/src/common/org-context.ts` | Create | `AsyncLocalStorage` ctx + helpers |
| `backend/src/common/org-context.middleware.ts` | Create | Express middleware that reads `req.user.organizationId` |
| `backend/src/common/org-scope.subscriber.ts` | Create | TypeORM subscriber injecting WHERE org |
| `backend/src/common/org-scoped.decorator.ts` | Create | `@OrgScoped()` + registry |
| `backend/src/email/email.service.ts` | Create | `EmailService` interface |
| `backend/src/email/resend-email.service.ts` | Create | Resend implementation |
| `backend/src/email/email.module.ts` | Create | Wires implementation |
| `backend/src/email/templates/EmailLayout.tsx` | Create | Shared layout |
| `backend/src/email/templates/InvitationEmail.tsx` | Create | Invitation template |
| `backend/src/email/templates/PasswordResetEmail.tsx` | Create | Reset link template |
| `backend/src/email/templates/PasswordChangedEmail.tsx` | Create | Security alert |
| `backend/src/cli/admin-create-org.ts` | Create | `npm run admin:create-org` |
| `backend/src/cli/audit-verify.ts` | Create | `npm run audit:verify` |
| `backend/src/data-source.ts` | Modify | Register all new entities |
| `backend/src/app.module.ts` | Modify | Wire new modules + middleware |
| `backend/package.json` | Modify | New scripts + deps |
| `backend/test/setup.ts` | Modify | Use `InMemoryKmsService` token |
| `backend/test/factories.ts` | Modify | `createOrg`, `createMembership`, `createPatient(orgId)` |
| `backend/test/org-isolation/patient.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/curacion.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/appointment.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/wound-photo.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/wound-note.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/consent-signature.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/product.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/canasta-category.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/monthly-cycle.spec.ts` | Create | Cross-tenant isolation tests |
| `backend/test/org-isolation/lot.spec.ts` | Create | Cross-tenant isolation tests (derived) |
| `backend/test/org-isolation/stock-count.spec.ts` | Create | Cross-tenant isolation tests (derived) |
| `frontend/src/contexts/AuthContext.tsx` | Modify | Org/role/establishments + refresh logic |
| `frontend/src/services/api.ts` | Modify | Refresh interceptor |
| `frontend/src/components/Layout.tsx` | Modify | Add org switcher + account dropdown |
| `frontend/src/components/OrgSwitcher.tsx` | Create | Header dropdown |
| `frontend/src/pages/AcceptInvitationPage.tsx` | Create | `/accept-invitation` |
| `frontend/src/pages/ForgotPasswordPage.tsx` | Create | `/forgot-password` |
| `frontend/src/pages/ResetPasswordPage.tsx` | Create | `/reset-password` |
| `frontend/src/pages/account/SessionsPage.tsx` | Create | `/account/sessions` |
| `frontend/src/pages/account/ChangePasswordPage.tsx` | Create | `/account/change-password` |
| `frontend/src/pages/org/MembersPage.tsx` | Create | `/org/members` |
| `frontend/src/pages/org/InvitationsPage.tsx` | Create | `/org/invitations` |
| `frontend/src/pages/org/EstablishmentsPage.tsx` | Create | `/org/establishments` |
| `frontend/src/pages/org/SettingsPage.tsx` | Create | `/org/settings` |
| `frontend/src/App.tsx` | Modify | Register new routes |
| `docs/runbooks/2026-04-28-multi-tenancy-migration.md` | Create | Production migration runbook |

---

## Phase 0 — Branch and dependencies setup

(Spec sections 1.2, 8 — scaffolding, no domain logic.)

### Task 0.1: Create branch off main

**Files:**
- (none)

- [ ] **Step 1: Verify clean working tree on main**

```bash
git status
git fetch origin
git checkout main
git pull origin main
```

Expected: `Your branch is up to date with 'origin/main'.`

- [ ] **Step 2: Create implementation branch**

```bash
git checkout -b feat/multi-tenancy-foundation
```

Expected: `Switched to a new branch 'feat/multi-tenancy-foundation'`.

- [ ] **Step 3: Push empty branch to origin**

```bash
git push -u origin feat/multi-tenancy-foundation
```

Expected: `* [new branch]      feat/multi-tenancy-foundation -> feat/multi-tenancy-foundation`.

### Task 0.2: Install backend dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd backend && npm install --save \
  @aws-sdk/client-kms@^3.668.0 \
  resend@^4.0.0 \
  @react-email/render@^1.0.2 \
  @react-email/components@^0.0.31 \
  uuid@^11.0.3 \
  commander@^12.1.0
```

Expected: install completes with no errors.

- [ ] **Step 2: Install dev deps**

```bash
cd backend && npm install --save-dev \
  @types/uuid@^10.0.0 \
  react@^18.3.1 \
  react-dom@^18.3.1 \
  @types/react@^18.3.12 \
  @types/react-dom@^18.3.1
```

Expected: install completes with no errors.

- [ ] **Step 3: Add CLI scripts to package.json**

In `backend/package.json` `"scripts"` block, add:

```json
"admin:create-org": "ts-node -r tsconfig-paths/register src/cli/admin-create-org.ts",
"audit:verify": "ts-node -r tsconfig-paths/register src/cli/audit-verify.ts",
"encryption:backfill": "ts-node -r tsconfig-paths/register src/kms/encryption-batch.script.ts"
```

- [ ] **Step 4: Verify install**

```bash
cd backend && npm ls @aws-sdk/client-kms resend
```

Expected: both listed at top level.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): add KMS, resend, react-email, commander deps"
```

### Task 0.3: Configure jsx for react-email

**Files:**
- Modify: `backend/tsconfig.json`

- [ ] **Step 1: Read current tsconfig**

```bash
cat backend/tsconfig.json
```

- [ ] **Step 2: Add jsx setting**

In `backend/tsconfig.json` under `compilerOptions`, ensure `"jsx": "react-jsx"` is present. If absent, add it.

- [ ] **Step 3: Verify typecheck still passes**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/tsconfig.json
git commit -m "chore(backend): enable react-jsx for email templates"
```

**Phase 0 complete when:** branch exists on origin; backend installs cleanly; tsc passes.

---

## Phase 1 — Data model: new tables

(Spec section 2.1.)

### Task 1.1: Organization entity

**Files:**
- Create: `backend/src/organizations/organization.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export enum OrganizationTier {
  FREE = 'free',
  PILOT = 'pilot',
  PAID = 'paid',
}

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rut: string | null;

  @Column({ type: 'varchar', default: OrganizationStatus.ACTIVE })
  status: OrganizationStatus;

  @Column({ type: 'varchar', default: OrganizationTier.PILOT })
  tier: OrganizationTier;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/organizations/organization.entity.ts
git commit -m "feat(backend): add Organization entity"
```

### Task 1.2: OrganizationMembership entity

**Files:**
- Create: `backend/src/organizations/organization-membership.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from './organization.entity';

export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  CLINICIAN = 'clinician',
  RECEPTIONIST = 'receptionist',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

@Entity('organization_memberships')
@Unique('UQ_membership_user_org', ['userId', 'organizationId'])
@Index('IDX_membership_user', ['userId'])
@Index('IDX_membership_org', ['organizationId'])
export class OrganizationMembership {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'varchar' })
  role: OrgRole;

  @Column({ type: 'varchar', default: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @Column({ type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/organizations/organization-membership.entity.ts
git commit -m "feat(backend): add OrganizationMembership entity"
```

### Task 1.3: UserEstablishmentAssignment entity

**Files:**
- Create: `backend/src/establishments/user-establishment-assignment.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Establishment } from './establishment.entity';

@Entity('user_establishment_assignments')
export class UserEstablishmentAssignment {
  @PrimaryColumn({ type: 'int' })
  userId: number;

  @PrimaryColumn({ type: 'bigint' })
  establishmentId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/establishments/user-establishment-assignment.entity.ts
git commit -m "feat(backend): add UserEstablishmentAssignment entity"
```

### Task 1.4: RefreshToken entity

**Files:**
- Create: `backend/src/auth/refresh-token.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('refresh_tokens')
@Index('IDX_refresh_user_revoked', ['userId', 'revokedAt'])
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  jti: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  deviceLabel: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @Column({ type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  rotatedFromJti: string | null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/refresh-token.entity.ts
git commit -m "feat(backend): add RefreshToken entity"
```

### Task 1.5: Invitation entity

**Files:**
- Create: `backend/src/auth/invitation.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { OrgRole } from '../organizations/organization-membership.entity';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar' })
  role: OrgRole;

  @Column({ type: 'int' })
  invitedById: number;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invitedById' })
  invitedBy: User;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/invitation.entity.ts
git commit -m "feat(backend): add Invitation entity"
```

### Task 1.6: PasswordResetToken entity

**Files:**
- Create: `backend/src/auth/password-reset-token.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('password_reset_tokens')
@Index('IDX_pwd_reset_user_used', ['userId', 'usedAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/password-reset-token.entity.ts
git commit -m "feat(backend): add PasswordResetToken entity"
```

### Task 1.7: Organizations barrel export

**Files:**
- Create: `backend/src/organizations/index.ts`

- [ ] **Step 1: Write barrel**

```typescript
export { Organization, OrganizationStatus, OrganizationTier } from './organization.entity';
export {
  OrganizationMembership,
  OrgRole,
  MembershipStatus,
} from './organization-membership.entity';
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/organizations/index.ts
git commit -m "feat(backend): add organizations barrel export"
```

**Phase 1 complete when:** all 6 new entities compile; barrel exports in place; no migration yet (deferred to Phase 3).

---

## Phase 2 — Data model: alter existing entities

(Spec section 2.2.)

### Task 2.1: User entity — add email/emailHash/emailVerifiedAt/passwordChangedAt; drop role

**Files:**
- Modify: `backend/src/users/user.entity.ts`

- [ ] **Step 1: Replace entity**

Replace the full content of `backend/src/users/user.entity.ts` with:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import {
  EncryptedField,
  encryptedColumnTransformer,
} from '../kms/encrypted-column.transformer';

export interface UserPreferences {
  inactivityThresholdDays: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  inactivityThresholdDays: 14,
};

@Entity('users')
@Unique('UQ_users_username', ['username'])
@Unique('UQ_users_email_hash', ['emailHash'])
@Index('IDX_users_email_hash', ['emailHash'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('User.email'),
  })
  email: EncryptedField | null;

  @Column({ type: 'char', length: 64, nullable: true })
  emailHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Typecheck (will fail until Phase 4 transformer exists)**

```bash
cd backend && npx tsc --noEmit
```

Expected: failure referencing `encrypted-column.transformer`. This is intentional — typechecking re-runs after Phase 4. **Do not fix yet.**

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/user.entity.ts
git commit -m "feat(backend): extend User with email, emailHash, password lifecycle"
```

### Task 2.2: Establishment entity — add organizationId

**Files:**
- Modify: `backend/src/establishments/establishment.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Entity('establishments')
@Index('IDX_establishment_org', ['organizationId'])
export class Establishment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  name: string;

  @Column()
  comuna: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/establishments/establishment.entity.ts
git commit -m "feat(backend): add organizationId to Establishment"
```

### Task 2.3: AuditLog entity — extend for hash chain + L2

**Files:**
- Modify: `backend/src/audit-log/audit-log.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EVENT = 'EVENT',
}

@Entity('audit_logs')
@Index('IDX_audit_org_id', ['organizationId', 'id'])
@Index('IDX_audit_entity', ['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', nullable: true })
  organizationId: string | null;

  @Column({ type: 'bigint', nullable: true })
  establishmentId: string | null;

  @Column()
  userId: number;

  @Column()
  username: string;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Column()
  entity: string;

  @Column()
  entityId: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson: Record<string, any> | null;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'char', length: 64 })
  payloadHash: string;

  @Column({ type: 'char', length: 64, nullable: true })
  prevHash: string | null;

  @Column({ type: 'char', length: 64 })
  chainHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/audit-log/audit-log.entity.ts
git commit -m "feat(backend): extend AuditLog with hash chain and L2 fields"
```

### Task 2.4: Patient entity — add organizationId + encrypt rut/address/phone

**Files:**
- Modify: `backend/src/patients/patient.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange, PatientStatus } from './patient-status-change.entity';
import { Organization } from '../organizations/organization.entity';
import {
  EncryptedField,
  encryptedColumnTransformer,
} from '../kms/encrypted-column.transformer';

@Entity('patients')
@Index('IDX_patient_org', ['organizationId'])
@Index('IDX_patient_org_status', ['organizationId', 'status'])
@Index('IDX_patient_rut_hash', ['rutHash'])
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({
    type: 'jsonb',
    transformer: encryptedColumnTransformer('Patient.rut'),
  })
  rut: EncryptedField;

  @Column({ type: 'char', length: 64 })
  rutHash: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'date' })
  birthDate: string;

  @Column()
  gender: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Patient.phone'),
  })
  phone: EncryptedField | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Patient.address'),
  })
  address: EncryptedField | null;

  @Column({ type: 'varchar', default: PatientStatus.ACTIVE })
  status: PatientStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => Curacion, (curacion) => curacion.patient)
  curaciones: Curacion[];

  @OneToMany(() => Appointment, (appointment) => appointment.patient)
  appointments: Appointment[];

  @OneToMany(() => PatientStatusChange, (sc) => sc.patient)
  statusChanges: PatientStatusChange[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/patients/patient.entity.ts
git commit -m "feat(backend): add organizationId and encrypt PII on Patient"
```

### Task 2.5: PatientStatusChange entity — add organizationId

**Files:**
- Modify: `backend/src/patients/patient-status-change.entity.ts`

- [ ] **Step 1: Add column near other columns**

Insert after the line `@Column() patientId: number;`:

```typescript
  @Column({ type: 'bigint' })
  organizationId: string;
```

Insert at top of class (after `@Entity` decorator on the file) the index decorator:

```typescript
@Index('IDX_psc_org', ['organizationId'])
```

And in imports add:

```typescript
import { Index } from 'typeorm';
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/patients/patient-status-change.entity.ts
git commit -m "feat(backend): add organizationId to PatientStatusChange"
```

### Task 2.6: Curacion entity — add organizationId + encrypt observations

**Files:**
- Modify: `backend/src/curaciones/curacion.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Appointment } from '../appointments/appointment.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { Organization } from '../organizations/organization.entity';
import {
  EncryptedField,
  encryptedColumnTransformer,
} from '../kms/encrypted-column.transformer';

export enum CuracionType {
  AVANZADA = 'avanzada',
  PIE_DIABETICO = 'pie_diabetico',
  ULCERA_VENOSA = 'ulcera_venosa',
}

@Entity('curaciones')
@Index('IDX_curacion_org', ['organizationId'])
@Index('IDX_curacion_org_date', ['organizationId', 'date'])
export class Curacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column({ type: 'varchar' })
  type: CuracionType;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Curacion.observations'),
  })
  observations: EncryptedField | null;

  @Column({ type: 'boolean', default: false })
  bootDelivered: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, (patient) => patient.curaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Appointment, (appointment) => appointment.curacion)
  appointment: Appointment;

  @OneToMany(() => CuracionEdit, (edit) => edit.curacion)
  edits: CuracionEdit[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/curaciones/curacion.entity.ts
git commit -m "feat(backend): add organizationId and encrypt observations on Curacion"
```

### Task 2.7: CuracionEdit entity — add organizationId

**Files:**
- Modify: `backend/src/curaciones/curacion-edit.entity.ts`

- [ ] **Step 1: Add organizationId column + index**

After `@Column() curacionId: number;` insert:

```typescript
  @Column({ type: 'bigint' })
  organizationId: string;
```

At top of class (after `@Entity` decorator) add:

```typescript
@Index('IDX_curacion_edit_org', ['organizationId'])
```

Add `Index` to the typeorm import.

- [ ] **Step 2: Commit**

```bash
git add backend/src/curaciones/curacion-edit.entity.ts
git commit -m "feat(backend): add organizationId to CuracionEdit"
```

### Task 2.8: Appointment entity — add organizationId

**Files:**
- Modify: `backend/src/appointments/appointment.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('appointments')
@Unique(['organizationId', 'date', 'time'])
@Index('IDX_appointment_org', ['organizationId'])
@Index('IDX_appointment_org_date', ['organizationId', 'date'])
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column({ nullable: true, unique: true })
  curacionId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  time: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, (patient) => patient.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Curacion, (curacion) => curacion.appointment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;
}
```

Note: the unique constraint on `(date,time)` is now scoped to org so different orgs can use the same slots.

- [ ] **Step 2: Commit**

```bash
git add backend/src/appointments/appointment.entity.ts
git commit -m "feat(backend): add organizationId to Appointment and scope uniqueness"
```

### Task 2.9: WoundPhoto entity — add organizationId

**Files:**
- Modify: `backend/src/wound-photos/wound-photo.entity.ts`

- [ ] **Step 1: Add column + index + Organization relation**

Replace the file content with:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('wound_photos')
@Index('IDX_wound_photo_org', ['organizationId'])
export class WoundPhoto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column()
  uploadedById: number;

  @Column()
  filename: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'date' })
  photoDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/wound-photos/wound-photo.entity.ts
git commit -m "feat(backend): add organizationId to WoundPhoto"
```

### Task 2.10: WoundNote entity — add organizationId + encrypt notes

**Files:**
- Modify: `backend/src/wound-notes/wound-note.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import {
  EncryptedField,
  encryptedColumnTransformer,
} from '../kms/encrypted-column.transformer';

export enum WoundColor {
  RED = 'red',
  YELLOW = 'yellow',
  BLACK = 'black',
  PINK = 'pink',
  MIXED = 'mixed',
}

export enum ExudateLevel {
  NONE = 'none',
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
}

export enum HealingStage {
  INFLAMMATORY = 'inflammatory',
  PROLIFERATIVE = 'proliferative',
  MATURATION = 'maturation',
  CHRONIC = 'chronic',
}

@Entity('wound_notes')
@Index('IDX_wound_note_org', ['organizationId'])
export class WoundNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  curacionId: number;

  @Column()
  recordedById: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  woundWidth: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  woundLength: number | null;

  @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true })
  woundArea: number | null;

  @Column({ type: 'varchar', nullable: true })
  woundColor: WoundColor | null;

  @Column({ type: 'varchar', nullable: true })
  exudateLevel: ExudateLevel | null;

  @Column({ type: 'varchar', nullable: true })
  healingStage: HealingStage | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('WoundNote.notes'),
  })
  notes: EncryptedField | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Curacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recordedById' })
  recordedBy: User;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/wound-notes/wound-note.entity.ts
git commit -m "feat(backend): add organizationId and encrypt notes on WoundNote"
```

### Task 2.11: ConsentSignature entity — add organizationId

**Files:**
- Modify: `backend/src/consent/consent-signature.entity.ts`

- [ ] **Step 1: Replace entity**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('consent_signatures')
@Index('IDX_consent_org', ['organizationId'])
export class ConsentSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column()
  witnessedById: number;

  @Column()
  filename: string;

  @Column({ type: 'text', nullable: true })
  consentText: string;

  @CreateDateColumn()
  signedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'witnessedById' })
  witnessedBy: User;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/consent/consent-signature.entity.ts
git commit -m "feat(backend): add organizationId to ConsentSignature"
```

### Task 2.12: Product entity — add organizationId

**Files:**
- Modify: `backend/src/inventory/products/product.entity.ts`

- [ ] **Step 1: Replace**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductCode } from './product-code.entity';
import { Organization } from '../../organizations/organization.entity';

export enum ProductType {
  INSUMO = 'INSUMO',
  MEDICAMENTO = 'MEDICAMENTO',
  ORTESIS = 'ORTESIS',
  OTRO = 'OTRO',
}

@Entity('products')
@Index('IDX_product_org', ['organizationId'])
export class Product {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column() name: string;
  @Column({ type: 'varchar' }) type: ProductType;
  @Column() packaging: string;
  @Column({ type: 'boolean', default: true }) tracksExpiration: boolean;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => ProductCode, (c) => c.product, { cascade: true })
  codes: ProductCode[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/inventory/products/product.entity.ts
git commit -m "feat(backend): add organizationId to Product"
```

### Task 2.13: CanastaCategory entity — add organizationId

**Files:**
- Modify: `backend/src/inventory/canasta/canasta-category.entity.ts`

- [ ] **Step 1: Replace**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { Organization } from '../../organizations/organization.entity';

export enum CanastaSection {
  INSUMOS = 'INSUMOS',
  AYUDAS_TECNICAS = 'AYUDAS_TECNICAS',
}

@Entity('canasta_categories')
@Index('IDX_canasta_category_org', ['organizationId'])
export class CanastaCategory {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column() name: string;
  @Column({ type: 'varchar' }) section: CanastaSection;
  @Column({ name: 'displayOrder' }) displayOrder: number;
  @Column({ type: 'boolean', default: false }) isOptional: boolean;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'boolean', default: false }) archived: boolean;
  @Index()
  @Column({ name: 'source_key', type: 'varchar', length: 120, nullable: true })
  sourceKey: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToMany(() => Product)
  @JoinTable({
    name: 'canasta_category_products',
    joinColumn: { name: 'canastaCategoryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'productId', referencedColumnName: 'id' },
  })
  products: Product[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/inventory/canasta/canasta-category.entity.ts
git commit -m "feat(backend): add organizationId to CanastaCategory"
```

### Task 2.14: MonthlyCycle entity — add organizationId

**Files:**
- Modify: `backend/src/cycles/cycle.entity.ts`

- [ ] **Step 1: Replace**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Entity('monthly_cycles')
@Unique(['organizationId', 'year', 'month'])
@Index('IDX_monthly_cycle_org', ['organizationId'])
export class MonthlyCycle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  year: number;

  @Column()
  month: number;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/cycles/cycle.entity.ts
git commit -m "feat(backend): add organizationId to MonthlyCycle"
```

**Phase 2 complete when:** all 11 tenanted entities have `organizationId`; encrypted-column entities reference the (yet to exist) transformer; typecheck remains broken (intentional, fixed in Phase 4).

---

## Phase 3 — Single big migration with backfill

(Spec section 7.1 — runbook step 3.)

### Task 3.1: Migration scaffold

**Files:**
- Create: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Create empty migration shell**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(backend): scaffold multi-tenancy migration"
```

### Task 3.2: Migration up() — create new tables

**Files:**
- Modify: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Insert into the body of `up()` (in order):**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(migration): create multi-tenancy core tables"
```

### Task 3.3: Migration up() — alter existing tables (add nullable organizationId + AuditLog + User)

**Files:**
- Modify: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Append to `up()` after Task 3.2 block**

```typescript
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
```

Note: the `jsonb_build_object('plaintext', ...)` form is a transient marker the encryption batch script (`encryption:backfill`) recognizes and replaces with proper `EncryptedField` JSON. Read code in `encryption-batch.script.ts` (Task 4.7) checks for `field.plaintext`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(migration): alter existing tables for tenancy and L2"
```

### Task 3.4: Migration up() — backfill default org + memberships + organizationId

**Files:**
- Modify: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Append to `up()`**

```typescript
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
```

Add a private helper at the bottom of the class (before closing `}`):

```typescript
  private async sha256Lower(input: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(input.toLowerCase()).digest('hex');
  }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(migration): backfill default org, owner membership, organizationId"
```

### Task 3.5: Migration up() — set NOT NULL + FKs + indexes

**Files:**
- Modify: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Append**

```typescript
    // ---- SET NOT NULL on organizationId ----
    const tablesNotNull = [
      'establishments', 'patients', 'patient_status_changes', 'curaciones',
      'curacion_edits', 'appointments', 'wound_photos', 'wound_notes',
      'consent_signatures', 'products', 'canasta_categories', 'monthly_cycles',
    ];
    for (const t of tablesNotNull) {
      await queryRunner.query(`ALTER TABLE "${t}" ALTER COLUMN "organizationId" SET NOT NULL`);
    }

    // ---- Add FKs to organizations ----
    for (const t of tablesNotNull) {
      await queryRunner.query(`
        ALTER TABLE "${t}"
        ADD CONSTRAINT "FK_${t}_org"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
      `);
    }

    // ---- Indexes ----
    await queryRunner.query(`CREATE INDEX "IDX_establishment_org"  ON "establishments"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_patient_org"        ON "patients"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_patient_org_status" ON "patients"("organizationId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_patient_rut_hash"   ON "patients"("rutHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_psc_org"            ON "patient_status_changes"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_curacion_org"       ON "curaciones"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_curacion_org_date"  ON "curaciones"("organizationId", "date")`);
    await queryRunner.query(`CREATE INDEX "IDX_curacion_edit_org"  ON "curacion_edits"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointment_org"    ON "appointments"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointment_org_date" ON "appointments"("organizationId", "date")`);
    await queryRunner.query(`CREATE INDEX "IDX_wound_photo_org"    ON "wound_photos"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_wound_note_org"     ON "wound_notes"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_consent_org"        ON "consent_signatures"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_org"        ON "products"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_canasta_category_org" ON "canasta_categories"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_monthly_cycle_org"  ON "monthly_cycles"("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_org_id"       ON "audit_logs"("organizationId", "id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_entity"       ON "audit_logs"("entity", "entityId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_hash" ON "users"("emailHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email_hash"   ON "users"("emailHash")`);

    // ---- Re-add scoped uniqueness ----
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "UQ_appointments_org_date_time" UNIQUE ("organizationId", "date", "time")`);
    await queryRunner.query(`ALTER TABLE "monthly_cycles" ADD CONSTRAINT "UQ_monthly_cycles_org_year_month" UNIQUE ("organizationId", "year", "month")`);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(migration): set NOT NULL, add FKs and tenancy indexes"
```

### Task 3.6: Migration up() — audit log hash chain rebuild

**Files:**
- Modify: `backend/src/migrations/1714400000000-MultiTenancyFoundation.ts`

- [ ] **Step 1: Append rebuild loop**

```typescript
    // ---- Audit log hash chain rebuild ----
    // Computes payloadHash + chainHash for every existing row, ordered by (orgId, id ASC).
    const { createHash } = await import('crypto');
    const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
    const compute = (row: any, prevHash: string | null) => {
      const payload = JSON.stringify({
        userId: row.userId,
        organizationId: row.organizationId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        beforeJson: row.beforeJson ?? null,
        afterJson: row.afterJson ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        requestId: row.requestId ?? null,
      });
      const payloadHash = sha256(payload);
      const chainHash = sha256((prevHash ?? 'GENESIS') + payloadHash);
      return { payloadHash, chainHash };
    };

    const orgs = await queryRunner.query(`SELECT DISTINCT "organizationId" AS oid FROM "audit_logs" ORDER BY oid`);
    for (const { oid } of orgs) {
      const rows = await queryRunner.query(
        `SELECT id, "userId", "organizationId", action, entity, "entityId",
                "beforeJson", "afterJson", "createdAt", "requestId"
         FROM "audit_logs" WHERE "organizationId" = $1 ORDER BY id ASC`,
        [oid],
      );
      let prev: string | null = null;
      for (const r of rows) {
        const { payloadHash, chainHash } = compute(r, prev);
        await queryRunner.query(
          `UPDATE "audit_logs" SET "payloadHash" = $1, "prevHash" = $2, "chainHash" = $3 WHERE id = $4`,
          [payloadHash, prev, chainHash, r.id],
        );
        prev = chainHash;
      }
    }

    // Set NOT NULL on hash columns now that all rows are filled.
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "payloadHash" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "chainHash" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "organizationId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_org" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`);
```

- [ ] **Step 2: Verify migration syntactically compiles**

```bash
cd backend && npx tsc --noEmit src/migrations/1714400000000-MultiTenancyFoundation.ts
```

Expected: errors only from missing KMS transformer references in entities (resolved in Phase 4). The migration file itself should compile.

- [ ] **Step 3: Commit**

```bash
git add backend/src/migrations/1714400000000-MultiTenancyFoundation.ts
git commit -m "feat(migration): rebuild audit log hash chain in up()"
```

### Task 3.7: Register migration in data-source.ts

**Files:**
- Modify: `backend/src/data-source.ts`

- [ ] **Step 1: Replace file**

```typescript
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Patient } from './patients/patient.entity';
import { Curacion } from './curaciones/curacion.entity';
import { MonthlyCycle } from './cycles/cycle.entity';
import { User } from './users/user.entity';
import { Appointment } from './appointments/appointment.entity';
import { PatientStatusChange } from './patients/patient-status-change.entity';
import { CuracionEdit } from './curaciones/curacion-edit.entity';
import { AuditLog } from './audit-log/audit-log.entity';
import { WoundPhoto } from './wound-photos/wound-photo.entity';
import { WoundNote } from './wound-notes/wound-note.entity';
import { ConsentSignature } from './consent/consent-signature.entity';
import { Establishment } from './establishments/establishment.entity';
import { Product } from './inventory/products/product.entity';
import { ProductCode } from './inventory/products/product-code.entity';
import { Lot } from './inventory/lots/lot.entity';
import { LotMovement } from './inventory/movements/lot-movement.entity';
import { StockCount } from './inventory/stock-counts/stock-count.entity';
import { CanastaCategory } from './inventory/canasta/canasta-category.entity';
import { CanastaCategoryProduct } from './inventory/canasta/canasta-category-product.entity';
import { Organization } from './organizations/organization.entity';
import { OrganizationMembership } from './organizations/organization-membership.entity';
import { UserEstablishmentAssignment } from './establishments/user-establishment-assignment.entity';
import { RefreshToken } from './auth/refresh-token.entity';
import { Invitation } from './auth/invitation.entity';
import { PasswordResetToken } from './auth/password-reset-token.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange,
    CuracionEdit, AuditLog, WoundPhoto, WoundNote, ConsentSignature,
    Establishment, Product, ProductCode, Lot, LotMovement, StockCount,
    CanastaCategory, CanastaCategoryProduct,
    Organization, OrganizationMembership, UserEstablishmentAssignment,
    RefreshToken, Invitation, PasswordResetToken,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/data-source.ts
git commit -m "chore(backend): register multi-tenancy entities in data-source"
```

**Phase 3 complete when:** migration file is committed; data-source registers all new entities; full project still does not typecheck (KMS imports missing — resolved in Phase 4).

---

## Phase 4 — KMS + envelope encryption infrastructure

(Spec section 5.)

### Task 4.1: EncryptedField type

**Files:**
- Create: `backend/src/kms/encrypted-field.ts`

- [ ] **Step 1: Write**

```typescript
export interface EncryptedField {
  v: 1;
  k: string;   // base64 encrypted DEK (per org, returned by KMS)
  iv: string;  // base64 GCM nonce (12 bytes)
  c: string;   // base64 ciphertext
  t: string;   // base64 GCM auth tag (16 bytes)
  aad: string; // e.g. "Patient.rut:42"
}

export function isEncryptedField(value: unknown): value is EncryptedField {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).v === 1 &&
    typeof (value as any).k === 'string' &&
    typeof (value as any).iv === 'string' &&
    typeof (value as any).c === 'string' &&
    typeof (value as any).t === 'string' &&
    typeof (value as any).aad === 'string'
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/kms/encrypted-field.ts
git commit -m "feat(kms): add EncryptedField type and guard"
```

### Task 4.2: KmsService interface

**Files:**
- Create: `backend/src/kms/kms.service.ts`

- [ ] **Step 1: Write**

```typescript
import { EncryptedField } from './encrypted-field';

export const KMS_SERVICE = Symbol('KMS_SERVICE');

export interface KmsService {
  encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField>;
  decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string>;
  rotateDek(organizationId: string): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/kms/kms.service.ts
git commit -m "feat(kms): add KmsService interface"
```

### Task 4.3: AwsKmsService implementation

**Files:**
- Create: `backend/src/kms/aws-kms.service.ts`

- [ ] **Step 1: Write spec test first (TDD)**

Create `backend/src/kms/aws-kms.service.spec.ts`:

```typescript
import { AwsKmsService } from './aws-kms.service';
import { InMemoryKmsService } from './in-memory-kms.service';

describe('KmsService roundtrip', () => {
  it('decrypts what it encrypts (in-memory)', async () => {
    const kms = new InMemoryKmsService();
    const enc = await kms.encrypt('hola', 'Patient.rut:1', '1');
    const dec = await kms.decrypt(enc, 'Patient.rut:1', '1');
    expect(dec).toBe('hola');
  });

  it('rejects on AAD mismatch', async () => {
    const kms = new InMemoryKmsService();
    const enc = await kms.encrypt('hola', 'Patient.rut:1', '1');
    await expect(kms.decrypt(enc, 'Patient.rut:2', '1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd backend && npx jest aws-kms.service.spec.ts
```

Expected: FAIL (file doesn't exist).

- [ ] **Step 3: Write implementation**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KmsService } from './kms.service';
import { EncryptedField } from './encrypted-field';

interface CachedDek {
  plaintext: Buffer;
  ciphertext: Buffer;
  expiresAt: number;
}

@Injectable()
export class AwsKmsService implements KmsService {
  private readonly logger = new Logger(AwsKmsService.name);
  private readonly client: KMSClient;
  private readonly cmkArn: string;
  private readonly cache = new Map<string, CachedDek>();
  private readonly ttlMs = 60 * 60 * 1000;

  constructor() {
    this.client = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.cmkArn = process.env.KMS_CMK_ARN!;
    if (!this.cmkArn) throw new Error('KMS_CMK_ARN not configured');
  }

  private async getDek(orgId: string): Promise<CachedDek> {
    const now = Date.now();
    const cached = this.cache.get(orgId);
    if (cached && cached.expiresAt > now) return cached;
    const res = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: this.cmkArn,
        KeySpec: 'AES_256',
        EncryptionContext: { organizationId: orgId },
      }),
    );
    const fresh: CachedDek = {
      plaintext: Buffer.from(res.Plaintext as Uint8Array),
      ciphertext: Buffer.from(res.CiphertextBlob as Uint8Array),
      expiresAt: now + this.ttlMs,
    };
    this.cache.set(orgId, fresh);
    return fresh;
  }

  private async decryptDek(ciphertext: string, orgId: string): Promise<Buffer> {
    const res = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        EncryptionContext: { organizationId: orgId },
      }),
    );
    return Buffer.from(res.Plaintext as Uint8Array);
  }

  async encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField> {
    const dek = await this.getDek(organizationId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek.plaintext, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      k: dek.ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      c: ct.toString('base64'),
      t: tag.toString('base64'),
      aad,
    };
  }

  async decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string> {
    if (field.aad !== aad) throw new Error('AAD mismatch');
    const dekPlaintext = await this.decryptDek(field.k, organizationId);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dekPlaintext,
      Buffer.from(field.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(field.t, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(field.c, 'base64')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  }

  async rotateDek(organizationId: string): Promise<void> {
    this.cache.delete(organizationId);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/kms/aws-kms.service.ts backend/src/kms/aws-kms.service.spec.ts
git commit -m "feat(kms): add AwsKmsService with envelope encryption + DEK cache"
```

### Task 4.4: InMemoryKmsService for tests

**Files:**
- Create: `backend/src/kms/in-memory-kms.service.ts`

- [ ] **Step 1: Write**

```typescript
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KmsService } from './kms.service';
import { EncryptedField } from './encrypted-field';

@Injectable()
export class InMemoryKmsService implements KmsService {
  private readonly dekByOrg = new Map<string, Buffer>();
  private readonly fakeKekArn = 'arn:aws:kms:test:fake-cmk';

  private getDek(orgId: string): Buffer {
    let dek = this.dekByOrg.get(orgId);
    if (!dek) {
      dek = randomBytes(32);
      this.dekByOrg.set(orgId, dek);
    }
    return dek;
  }

  async encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField> {
    const dek = this.getDek(organizationId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // "Encrypted DEK" is just the org id base64-encoded — purely for shape parity.
    return {
      v: 1,
      k: Buffer.from(`fake:${organizationId}`).toString('base64'),
      iv: iv.toString('base64'),
      c: ct.toString('base64'),
      t: tag.toString('base64'),
      aad,
    };
  }

  async decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string> {
    if (field.aad !== aad) throw new Error('AAD mismatch');
    const dek = this.getDek(organizationId);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(field.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(field.t, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(field.c, 'base64')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  }

  async rotateDek(organizationId: string): Promise<void> {
    this.dekByOrg.delete(organizationId);
  }
}
```

- [ ] **Step 2: Run kms test**

```bash
cd backend && npx jest aws-kms.service.spec.ts
```

Expected: PASS (both tests).

- [ ] **Step 3: Commit**

```bash
git add backend/src/kms/in-memory-kms.service.ts
git commit -m "feat(kms): add InMemoryKmsService test double"
```

### Task 4.5: Encrypted column transformer

**Files:**
- Create: `backend/src/kms/encrypted-column.transformer.ts`

- [ ] **Step 1: Write**

```typescript
import { ValueTransformer } from 'typeorm';
import { EncryptedField } from './encrypted-field';

/**
 * IMPORTANT: TypeORM transformers are sync. We cannot call KMS here.
 * Therefore: persistence already stores `EncryptedField` JSON (created by
 * the service layer using KmsService). The transformer here is a passthrough
 * that DOCUMENTS the column intent and validates shape on read.
 *
 * Service-layer code is responsible for calling kms.encrypt/decrypt around
 * any read/write of these fields.
 */
export { EncryptedField };

export function encryptedColumnTransformer(_aadPrefix: string): ValueTransformer {
  return {
    to: (value: EncryptedField | null) => value ?? null,
    from: (value: any) => (value as EncryptedField | null) ?? null,
  };
}
```

- [ ] **Step 2: Run typecheck on entire backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors limited to references that exist outside Phase 4 scope. Re-check user.entity, patient.entity, curacion.entity, wound-note.entity all resolve their `encryptedColumnTransformer` import.

- [ ] **Step 3: Commit**

```bash
git add backend/src/kms/encrypted-column.transformer.ts
git commit -m "feat(kms): add passthrough encrypted column transformer"
```

### Task 4.6: KmsModule wiring

**Files:**
- Create: `backend/src/kms/kms.module.ts`

- [ ] **Step 1: Write**

```typescript
import { Module, Global } from '@nestjs/common';
import { KMS_SERVICE } from './kms.service';
import { AwsKmsService } from './aws-kms.service';
import { InMemoryKmsService } from './in-memory-kms.service';

@Global()
@Module({
  providers: [
    {
      provide: KMS_SERVICE,
      useClass: process.env.KMS_BACKEND === 'memory' ? InMemoryKmsService : AwsKmsService,
    },
  ],
  exports: [KMS_SERVICE],
})
export class KmsModule {}
```

- [ ] **Step 2: Wire into AppModule**

In `backend/src/app.module.ts`, around line 47 (with the other module imports), add:

```typescript
import { KmsModule } from './kms/kms.module';
```

And inside `imports: [...]`, append `KmsModule,` after `ThrottlerModule.forRootAsync(...)`.

- [ ] **Step 3: Configure test env**

In `backend/.env.test` (create if missing), add:

```
KMS_BACKEND=memory
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/kms/kms.module.ts backend/src/app.module.ts backend/.env.test
git commit -m "feat(kms): register KmsModule globally and use in-memory in tests"
```

### Task 4.7: Encryption batch script

**Files:**
- Create: `backend/src/kms/encryption-batch.script.ts`

- [ ] **Step 1: Write**

```typescript
/**
 * One-shot batch: walks tenanted entities and encrypts the v1 sensitive fields.
 * Idempotent: rows already in EncryptedField shape (`v: 1`) are skipped.
 *
 * Usage: `npm run encryption:backfill`
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { KMS_SERVICE, KmsService } from './kms.service';
import { isEncryptedField } from './encrypted-field';
import { runWithBypass } from '../common/org-context';
import { createHash } from 'crypto';

const CHUNK = 500;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const ds = app.get(DataSource);
  const kms = app.get<KmsService>(KMS_SERVICE);

  await runWithBypass(async () => {
    await encryptColumn(ds, kms, 'patients', 'rut', 'Patient.rut', { hashCol: 'rutHash' });
    await encryptColumn(ds, kms, 'patients', 'phone', 'Patient.phone');
    await encryptColumn(ds, kms, 'patients', 'address', 'Patient.address');
    await encryptColumn(ds, kms, 'curaciones', 'observations', 'Curacion.observations');
    await encryptColumn(ds, kms, 'wound_notes', 'notes', 'WoundNote.notes');
    await encryptColumn(ds, kms, 'users', 'email', 'User.email', { hashCol: 'emailHash', lowerHash: true });
  });

  await app.close();
}

async function encryptColumn(
  ds: DataSource,
  kms: KmsService,
  table: string,
  column: string,
  aadPrefix: string,
  opts: { hashCol?: string; lowerHash?: boolean } = {},
) {
  let offset = 0;
  while (true) {
    const rows = await ds.query(
      `SELECT id, "organizationId", "${column}" AS val FROM "${table}" ORDER BY id LIMIT $1 OFFSET $2`,
      [CHUNK, offset],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.val === null) continue;
      if (isEncryptedField(r.val)) continue; // already encrypted
      const plaintext = typeof r.val === 'object' && r.val.plaintext ? r.val.plaintext : r.val;
      if (typeof plaintext !== 'string') continue;
      const aad = `${aadPrefix}:${r.id}`;
      const encrypted = await kms.encrypt(plaintext, aad, String(r.organizationId ?? '1'));
      const params: any[] = [encrypted, r.id];
      let setHash = '';
      if (opts.hashCol) {
        const h = createHash('sha256').update(opts.lowerHash ? plaintext.toLowerCase() : plaintext).digest('hex');
        params.splice(1, 0, h);
        setHash = `, "${opts.hashCol}" = $2`;
      }
      await ds.query(
        `UPDATE "${table}" SET "${column}" = $1${setHash} WHERE id = $${params.length}`,
        params,
      );
    }
    offset += rows.length;
    console.log(`[enc] ${table}.${column}: ${offset} processed`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/kms/encryption-batch.script.ts
git commit -m "feat(kms): add encryption batch backfill script"
```

**Phase 4 complete when:** kms test passes; transformer compiles; AppModule wires KmsModule; backfill script ready (it depends on Phase 5 `runWithBypass`, but commits first since runtime is later).

---

## Phase 5 — Org context + isolation

(Spec section 4.1.)

### Task 5.1: AsyncLocalStorage + helpers

**Files:**
- Create: `backend/src/common/org-context.ts`

- [ ] **Step 1: Write spec test (TDD)**

`backend/src/common/org-context.spec.ts`:

```typescript
import {
  orgContext,
  runWithOrg,
  runWithBypass,
  getCurrentOrgId,
  isBypassed,
} from './org-context';

describe('orgContext', () => {
  it('exposes orgId inside runWithOrg', async () => {
    let captured: string | undefined;
    await runWithOrg('42', async () => {
      captured = getCurrentOrgId();
    });
    expect(captured).toBe('42');
  });

  it('marks bypass inside runWithBypass', async () => {
    let bypassed = false;
    await runWithBypass(async () => {
      bypassed = isBypassed();
    });
    expect(bypassed).toBe(true);
  });

  it('returns undefined outside any run', () => {
    expect(getCurrentOrgId()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd backend && npx jest org-context.spec.ts
```

- [ ] **Step 3: Implement**

```typescript
import { AsyncLocalStorage } from 'async_hooks';

export interface OrgContextStore {
  organizationId?: string;
  bypass?: boolean;
}

export const orgContext = new AsyncLocalStorage<OrgContextStore>();

export function runWithOrg<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    orgContext.run({ organizationId }, () => fn().then(resolve, reject));
  });
}

export function runWithBypass<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    orgContext.run({ bypass: true }, () => fn().then(resolve, reject));
  });
}

export function getCurrentOrgId(): string | undefined {
  return orgContext.getStore()?.organizationId;
}

export function isBypassed(): boolean {
  return orgContext.getStore()?.bypass === true;
}

export function getStoreOrThrow(): OrgContextStore {
  const s = orgContext.getStore();
  if (!s) throw new Error('No org context active');
  return s;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd backend && npx jest org-context.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/org-context.ts backend/src/common/org-context.spec.ts
git commit -m "feat(common): add AsyncLocalStorage-based org context"
```

### Task 5.2: @OrgScoped() decorator + entity registry

**Files:**
- Create: `backend/src/common/org-scoped.decorator.ts`

- [ ] **Step 1: Write**

```typescript
const TENANTED_ENTITIES = new Set<Function>();

export function OrgScoped(): ClassDecorator {
  return (target: any) => {
    TENANTED_ENTITIES.add(target);
  };
}

export function isOrgScopedEntity(target: Function): boolean {
  return TENANTED_ENTITIES.has(target);
}

export function listOrgScopedEntities(): Function[] {
  return Array.from(TENANTED_ENTITIES);
}
```

- [ ] **Step 2: Apply `@OrgScoped()` to all 11 tenanted entities**

Add `@OrgScoped()` directly above each `@Entity(...)` decorator in:

- `backend/src/establishments/establishment.entity.ts`
- `backend/src/patients/patient.entity.ts`
- `backend/src/patients/patient-status-change.entity.ts`
- `backend/src/curaciones/curacion.entity.ts`
- `backend/src/curaciones/curacion-edit.entity.ts`
- `backend/src/appointments/appointment.entity.ts`
- `backend/src/wound-photos/wound-photo.entity.ts`
- `backend/src/wound-notes/wound-note.entity.ts`
- `backend/src/consent/consent-signature.entity.ts`
- `backend/src/inventory/products/product.entity.ts`
- `backend/src/inventory/canasta/canasta-category.entity.ts`
- `backend/src/cycles/cycle.entity.ts`

Add the import line `import { OrgScoped } from '../common/org-scoped.decorator';` (adjust relative path) at the top of each file.

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors related to OrgScoped.

- [ ] **Step 4: Commit**

```bash
git add backend/src/common/org-scoped.decorator.ts \
        backend/src/establishments/establishment.entity.ts \
        backend/src/patients/patient.entity.ts \
        backend/src/patients/patient-status-change.entity.ts \
        backend/src/curaciones/curacion.entity.ts \
        backend/src/curaciones/curacion-edit.entity.ts \
        backend/src/appointments/appointment.entity.ts \
        backend/src/wound-photos/wound-photo.entity.ts \
        backend/src/wound-notes/wound-note.entity.ts \
        backend/src/consent/consent-signature.entity.ts \
        backend/src/inventory/products/product.entity.ts \
        backend/src/inventory/canasta/canasta-category.entity.ts \
        backend/src/cycles/cycle.entity.ts
git commit -m "feat(common): mark 11 entities @OrgScoped"
```

### Task 5.3: OrgContextMiddleware

**Files:**
- Create: `backend/src/common/org-context.middleware.ts`

- [ ] **Step 1: Write**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { orgContext } from './org-context';

@Injectable()
export class OrgContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const user: any = (req as any).user;
    const organizationId: string | undefined = user?.organizationId;
    if (!organizationId) {
      return next();
    }
    orgContext.run({ organizationId: String(organizationId) }, () => next());
  }
}
```

- [ ] **Step 2: Wire in AppModule**

In `backend/src/app.module.ts`, change `export class AppModule {}` to:

```typescript
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { OrgContextMiddleware } from './common/org-context.middleware';

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OrgContextMiddleware).forRoutes('*');
  }
}
```

(Replace `export class AppModule {}` near line 99.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/org-context.middleware.ts backend/src/app.module.ts
git commit -m "feat(common): apply OrgContextMiddleware globally"
```

### Task 5.4: OrgScopeSubscriber

**Files:**
- Create: `backend/src/common/org-scope.subscriber.ts`

- [ ] **Step 1: Write**

```typescript
import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  DataSource,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { orgContext } from './org-context';
import { isOrgScopedEntity } from './org-scoped.decorator';

@Injectable()
@EventSubscriber()
export class OrgScopeSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<any>) {
    const target = event.metadata.target as Function;
    if (!isOrgScopedEntity(target)) return;
    const store = orgContext.getStore();
    if (store?.bypass) return;
    if (event.entity.organizationId) return;
    if (!store?.organizationId) {
      throw new Error(
        `Cannot insert into ${event.metadata.tableName} without org context`,
      );
    }
    event.entity.organizationId = store.organizationId;
  }
}
```

- [ ] **Step 2: Wire**

In `backend/src/app.module.ts`, after `BootstrapService`, register a provider:

```typescript
import { OrgScopeSubscriber } from './common/org-scope.subscriber';
```

In `providers: [...]`, add:

```typescript
OrgScopeSubscriber,
```

- [ ] **Step 3: Add SELECT-side guard via repository wrapper**

Create `backend/src/common/org-scoped.repository.ts`:

```typescript
import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import { orgContext } from './org-context';

/**
 * Helper used by services that read tenanted entities. Adds
 * `where.organizationId = ctx.organizationId` automatically. If no context
 * is active and bypass is not set, throws.
 */
export async function findScoped<T extends { organizationId?: string }>(
  repo: Repository<T>,
  options: FindManyOptions<T> = {},
): Promise<T[]> {
  const store = orgContext.getStore();
  if (!store) throw new Error('findScoped: no org context');
  if (store.bypass) return repo.find(options);
  const where = { ...(options.where ?? {}), organizationId: store.organizationId } as any;
  return repo.find({ ...options, where });
}

export async function findOneScoped<T extends { organizationId?: string }>(
  repo: Repository<T>,
  options: FindOneOptions<T>,
): Promise<T | null> {
  const store = orgContext.getStore();
  if (!store) throw new Error('findOneScoped: no org context');
  if (store.bypass) return repo.findOne(options);
  const where = { ...(options.where ?? {}), organizationId: store.organizationId } as any;
  return repo.findOne({ ...options, where });
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/common/org-scope.subscriber.ts \
        backend/src/common/org-scoped.repository.ts \
        backend/src/app.module.ts
git commit -m "feat(common): add OrgScopeSubscriber and scoped repo helpers"
```

**Phase 5 complete when:** middleware + subscriber + helpers compile; entities marked `@OrgScoped()`; org-context tests pass.

---

## Phase 6 — Audit log with hash chain

(Spec section 4.2.)

### Task 6.1: AuditChainService — hash compute helpers

**Files:**
- Create: `backend/src/audit-log/audit-chain.service.ts`

- [ ] **Step 1: Write spec test**

`backend/src/audit-log/audit-chain.service.spec.ts`:

```typescript
import { AuditChainService } from './audit-chain.service';

describe('AuditChainService', () => {
  const svc = new AuditChainService();

  it('computes payloadHash deterministically', () => {
    const row = {
      userId: 1,
      organizationId: '1',
      action: 'CREATE',
      entity: 'patients',
      entityId: 5,
      beforeJson: null,
      afterJson: { name: 'a' },
      createdAt: new Date('2026-04-28T10:00:00.000Z'),
      requestId: null,
    };
    expect(svc.computePayloadHash(row)).toBe(svc.computePayloadHash(row));
  });

  it('chainHash uses GENESIS for null prevHash', () => {
    const ph = 'a'.repeat(64);
    const ch = svc.computeChainHash(null, ph);
    expect(ch).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
cd backend && npx jest audit-chain.service.spec.ts
```

- [ ] **Step 3: Implement**

```typescript
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface ChainableAuditRow {
  userId: number;
  organizationId: string;
  action: string;
  entity: string;
  entityId: number;
  beforeJson: Record<string, any> | null;
  afterJson: Record<string, any> | null;
  createdAt: Date;
  requestId: string | null;
}

@Injectable()
export class AuditChainService {
  private sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  computePayloadHash(row: ChainableAuditRow): string {
    return this.sha256(
      JSON.stringify({
        userId: row.userId,
        organizationId: row.organizationId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        beforeJson: row.beforeJson ?? null,
        afterJson: row.afterJson ?? null,
        createdAt: row.createdAt.toISOString(),
        requestId: row.requestId ?? null,
      }),
    );
  }

  computeChainHash(prevHash: string | null, payloadHash: string): string {
    return this.sha256((prevHash ?? 'GENESIS') + payloadHash);
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/audit-log/audit-chain.service.ts backend/src/audit-log/audit-chain.service.spec.ts
git commit -m "feat(audit-log): add AuditChainService with deterministic hash"
```

### Task 6.2: AuditLogService — atomic insert with FOR UPDATE

**Files:**
- Modify: `backend/src/audit-log/audit-log.service.ts`

- [ ] **Step 1: Replace file**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, DataSource } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';
import { AuditChainService } from './audit-chain.service';

interface LogEntry {
  userId: number;
  username: string;
  organizationId: string;
  establishmentId?: string | null;
  action: AuditAction;
  entity: string;
  entityId: number;
  payload?: Record<string, any> | null;
  beforeJson?: Record<string, any> | null;
  afterJson?: Record<string, any> | null;
  ipAddress?: string;
  userAgent?: string | null;
  requestId?: string | null;
}

interface FindAllOptions {
  page: number;
  limit: number;
  entity?: string;
  entityId?: number;
  userId?: number;
  from?: string;
  to?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly chain: AuditChainService,
  ) {}

  async log(entry: LogEntry): Promise<AuditLog> {
    return this.dataSource.transaction(async (tx) => {
      const last = await tx.query(
        `SELECT "chainHash" FROM "audit_logs"
           WHERE "organizationId" = $1
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [entry.organizationId],
      );
      const prevHash: string | null = last[0]?.chainHash ?? null;
      const createdAt = new Date();
      const payloadHash = this.chain.computePayloadHash({
        userId: entry.userId,
        organizationId: entry.organizationId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson ?? null,
        afterJson: entry.afterJson ?? null,
        createdAt,
        requestId: entry.requestId ?? null,
      });
      const chainHash = this.chain.computeChainHash(prevHash, payloadHash);

      const row = tx.getRepository(AuditLog).create({
        userId: entry.userId,
        username: entry.username,
        organizationId: entry.organizationId,
        establishmentId: entry.establishmentId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        payload: entry.payload ?? null,
        beforeJson: entry.beforeJson ?? null,
        afterJson: entry.afterJson ?? null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
        payloadHash,
        prevHash,
        chainHash,
        createdAt,
      });
      return tx.getRepository(AuditLog).save(row);
    });
  }

  async findAll(options: FindAllOptions) {
    const where: FindOptionsWhere<AuditLog> = {};
    if (options.entity) where.entity = options.entity;
    if (options.entityId) where.entityId = options.entityId;
    if (options.userId) where.userId = options.userId;
    if (options.from && options.to) {
      where.createdAt = Between(new Date(options.from), new Date(options.to + 'T23:59:59'));
    }
    const [data, total] = await this.auditLogRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });
    return {
      data,
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }
}
```

- [ ] **Step 2: Update audit-log.module.ts to provide AuditChainService**

Edit `backend/src/audit-log/audit-log.module.ts` and add `AuditChainService` to providers + exports:

```typescript
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogController } from './audit-log.controller';
import { AuditChainService } from './audit-chain.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogInterceptor, AuditChainService],
  exports: [AuditLogService, AuditLogInterceptor, AuditChainService],
})
export class AuditLogModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/audit-log/audit-log.service.ts backend/src/audit-log/audit-log.module.ts
git commit -m "feat(audit-log): atomic hash-chain insert with FOR UPDATE"
```

### Task 6.3: AuditLogInterceptor — capture before/after, requestId, userAgent

**Files:**
- Modify: `backend/src/audit-log/audit-log.interceptor.ts`

- [ ] **Step 1: Replace file**

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';

const SKIP_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/invitations/preview',
  '/api/auth/invitations/accept',
  '/api/health',
  '/api/users/seed',
  '/api/patients/seed',
  '/api/inventory/products/import',
];

const CUSTOM_AUDIT_PATHS: Array<{ pattern: RegExp; method: string }> = [
  { pattern: /^\/api\/curaciones\/\d+$/, method: 'PUT' },
  { pattern: /^\/api\/patients\/\d+\/discharge$/, method: 'POST' },
  { pattern: /^\/api\/patients\/\d+\/readmit$/, method: 'POST' },
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, path, body, user, ip, headers } = req;

    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }
    if (SKIP_PATHS.includes(path)) {
      return next.handle();
    }
    if (CUSTOM_AUDIT_PATHS.some((e) => e.pattern.test(path) && method === e.method)) {
      return next.handle();
    }
    if (!user) {
      return next.handle();
    }

    const action = method === 'POST'
      ? AuditAction.CREATE
      : method === 'PUT'
        ? AuditAction.UPDATE
        : AuditAction.DELETE;

    const pathParts = path.replace('/api/', '').split('/');
    const entity = pathParts[0];
    const entityId = parseInt(pathParts[1], 10) || 0;
    const requestId: string = headers['x-request-id'] || uuid();

    return next.handle().pipe(
      tap((responseBody) => {
        const logEntityId = entityId || responseBody?.id || 0;
        this.auditLogService.log({
          userId: user.id || user.sub,
          username: user.username,
          organizationId: String(user.organizationId),
          establishmentId: user.establishmentId ?? null,
          action,
          entity,
          entityId: logEntityId,
          payload: method !== 'DELETE' ? body : undefined,
          afterJson: method !== 'DELETE' ? responseBody : undefined,
          ipAddress: ip,
          userAgent: headers['user-agent'] ?? null,
          requestId,
        }).catch(() => {/* never break the request */});
      }),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/audit-log/audit-log.interceptor.ts
git commit -m "feat(audit-log): capture orgId, requestId, userAgent, afterJson"
```

### Task 6.4: @AuditEvent decorator for custom events

**Files:**
- Create: `backend/src/audit-log/audit-event.decorator.ts`

- [ ] **Step 1: Write**

```typescript
import { SetMetadata, applyDecorators, UseInterceptors, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';
import { v4 as uuid } from 'uuid';

const AUDIT_EVENT_KEY = 'audit:event:name';

export function AuditEvent(eventName: string) {
  return applyDecorators(
    SetMetadata(AUDIT_EVENT_KEY, eventName),
    UseInterceptors(AuditEventInterceptor),
  );
}

@Injectable()
export class AuditEventInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const eventName = this.reflector.get<string>(AUDIT_EVENT_KEY, ctx.getHandler());
    if (!eventName) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const { user, ip, headers, body } = req;
    const requestId = headers['x-request-id'] || uuid();
    return next.handle().pipe(
      tap((res) => {
        if (!user?.organizationId) return;
        this.auditLog.log({
          userId: user.id || user.sub,
          username: user.username,
          organizationId: String(user.organizationId),
          action: AuditAction.EVENT,
          entity: eventName,
          entityId: res?.id || 0,
          payload: body,
          afterJson: res ?? null,
          ipAddress: ip,
          userAgent: headers['user-agent'] ?? null,
          requestId,
        }).catch(() => {});
      }),
    );
  }
}
```

- [ ] **Step 2: Register interceptor in AuditLogModule providers**

Update `backend/src/audit-log/audit-log.module.ts`: add `AuditEventInterceptor` to imports/providers/exports.

- [ ] **Step 3: Commit**

```bash
git add backend/src/audit-log/audit-event.decorator.ts backend/src/audit-log/audit-log.module.ts
git commit -m "feat(audit-log): add @AuditEvent decorator for custom events"
```

**Phase 6 complete when:** chain service tests pass; interceptor captures org+requestId+userAgent; `@AuditEvent` available; existing routes still work.

---

## Phase 7 — Email infrastructure

(Spec section 6.4.)

### Task 7.1: EmailService interface

**Files:**
- Create: `backend/src/email/email.service.ts`

- [ ] **Step 1: Write**

```typescript
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

export interface SendOptions {
  to: string;
  subject: string;
  react: any;          // react element (compiled by EmailService impl)
  text?: string;       // optional fallback
  tags?: Record<string, string>;
}

export interface EmailService {
  send(options: SendOptions): Promise<{ id: string }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/email.service.ts
git commit -m "feat(email): add EmailService interface"
```

### Task 7.2: ResendEmailService

**Files:**
- Create: `backend/src/email/resend-email.service.ts`

- [ ] **Step 1: Write**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { EmailService, SendOptions } from './email.service';

@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    this.client = new Resend(process.env.RESEND_API_KEY!);
    this.from = process.env.EMAIL_FROM || 'Curaciones <noreply@curaciones.placeholder>';
  }

  async send(options: SendOptions): Promise<{ id: string }> {
    const html = await render(options.react);
    const res = await this.client.emails.send({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html,
      text: options.text,
      tags: options.tags
        ? Object.entries(options.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    });
    if (res.error) {
      this.logger.error(`Resend send failed: ${res.error.message}`);
      throw new Error(`Email send failed: ${res.error.message}`);
    }
    return { id: res.data?.id || '' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/resend-email.service.ts
git commit -m "feat(email): add ResendEmailService implementation"
```

### Task 7.3: NoopEmailService for tests

**Files:**
- Create: `backend/src/email/noop-email.service.ts`

- [ ] **Step 1: Write**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EmailService, SendOptions } from './email.service';

@Injectable()
export class NoopEmailService implements EmailService {
  private readonly logger = new Logger(NoopEmailService.name);
  public sent: SendOptions[] = [];

  async send(options: SendOptions): Promise<{ id: string }> {
    this.logger.log(`[noop-email] to=${options.to} subject=${options.subject}`);
    this.sent.push(options);
    return { id: `noop-${this.sent.length}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/noop-email.service.ts
git commit -m "feat(email): add NoopEmailService for tests and dev"
```

### Task 7.4: EmailModule

**Files:**
- Create: `backend/src/email/email.module.ts`

- [ ] **Step 1: Write**

```typescript
import { Module, Global } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.service';
import { ResendEmailService } from './resend-email.service';
import { NoopEmailService } from './noop-email.service';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useClass: process.env.EMAIL_BACKEND === 'noop' ? NoopEmailService : ResendEmailService,
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
```

- [ ] **Step 2: Wire into AppModule** (add to `imports: [...]` after `KmsModule`):

```typescript
import { EmailModule } from './email/email.module';
// ...
EmailModule,
```

- [ ] **Step 3: In `.env.test`, add**

```
EMAIL_BACKEND=noop
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/email/email.module.ts backend/src/app.module.ts backend/.env.test
git commit -m "feat(email): register EmailModule globally; noop in tests"
```

### Task 7.5: EmailLayout shared template

**Files:**
- Create: `backend/src/email/templates/EmailLayout.tsx`

- [ ] **Step 1: Write**

```tsx
import * as React from 'react';
import { Html, Body, Container, Section, Text, Hr, Img } from '@react-email/components';

export const BRAND_NAME = process.env.EMAIL_BRAND_NAME || 'Curaciones';
export const BRAND_URL = process.env.EMAIL_BRAND_URL || 'https://curaciones.placeholder';

export function EmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Body style={{ backgroundColor: '#f5f7f8', fontFamily: 'Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 560, margin: '0 auto', borderRadius: 8, padding: 32 }}>
          <Section>
            <Text style={{ fontSize: 18, fontWeight: 700, color: '#00897B', margin: 0 }}>
              {BRAND_NAME}
            </Text>
          </Section>
          <Hr style={{ borderColor: '#cfd8dc', margin: '16px 0' }} />
          {children}
          <Hr style={{ borderColor: '#cfd8dc', margin: '24px 0 12px' }} />
          <Text style={{ fontSize: 12, color: '#90a4ae', margin: 0 }}>
            Este correo fue enviado por {BRAND_NAME}. Si no esperabas este mensaje, puedes ignorarlo.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/templates/EmailLayout.tsx
git commit -m "feat(email): add shared EmailLayout template"
```

### Task 7.6: InvitationEmail template

**Files:**
- Create: `backend/src/email/templates/InvitationEmail.tsx`

- [ ] **Step 1: Write**

```tsx
import * as React from 'react';
import { Text, Button, Section } from '@react-email/components';
import { EmailLayout, BRAND_URL } from './EmailLayout';

interface Props {
  inviteeEmail: string;
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function InvitationEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16 }}>Hola,</Text>
        <Text>
          {props.inviterName} te invitó a unirte a <strong>{props.organizationName}</strong> como{' '}
          <strong>{props.role}</strong>.
        </Text>
        <Text>Hacé clic en el botón para aceptar la invitación y crear tu cuenta:</Text>
        <Button
          href={props.acceptUrl}
          style={{
            backgroundColor: '#00897B',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
            margin: '16px 0',
          }}
        >
          Aceptar invitación
        </Button>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          Este link expira en {props.expiresInDays} días. Si no querés unirte, ignorá este mensaje.
        </Text>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          Sitio: {BRAND_URL}
        </Text>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/templates/InvitationEmail.tsx
git commit -m "feat(email): add InvitationEmail template"
```

### Task 7.7: PasswordResetEmail template

**Files:**
- Create: `backend/src/email/templates/PasswordResetEmail.tsx`

- [ ] **Step 1: Write**

```tsx
import * as React from 'react';
import { Text, Button, Section } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface Props {
  resetUrl: string;
  expiresInMinutes: number;
}

export function PasswordResetEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16, fontWeight: 600 }}>Restablecer contraseña</Text>
        <Text>Recibimos una solicitud para restablecer tu contraseña.</Text>
        <Button
          href={props.resetUrl}
          style={{
            backgroundColor: '#00897B',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
            margin: '16px 0',
          }}
        >
          Crear nueva contraseña
        </Button>
        <Text style={{ fontSize: 12, color: '#616161' }}>
          El link expira en {props.expiresInMinutes} minutos. Si no solicitaste esto, ignorá este mensaje.
        </Text>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/templates/PasswordResetEmail.tsx
git commit -m "feat(email): add PasswordResetEmail template"
```

### Task 7.8: PasswordChangedEmail template

**Files:**
- Create: `backend/src/email/templates/PasswordChangedEmail.tsx`

- [ ] **Step 1: Write**

```tsx
import * as React from 'react';
import { Text, Section } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface Props {
  changedAt: Date;
  ipAddress?: string;
}

export function PasswordChangedEmail(props: Props) {
  return (
    <EmailLayout>
      <Section>
        <Text style={{ fontSize: 16, fontWeight: 600, color: '#c62828' }}>
          Tu contraseña fue actualizada
        </Text>
        <Text>
          Tu contraseña fue cambiada el {props.changedAt.toLocaleString('es-CL')}
          {props.ipAddress ? ` desde ${props.ipAddress}` : ''}.
        </Text>
        <Text>
          Si no fuiste vos, contactanos inmediatamente y restablecé tu contraseña.
        </Text>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/email/templates/PasswordChangedEmail.tsx
git commit -m "feat(email): add PasswordChangedEmail security alert template"
```

**Phase 7 complete when:** EmailModule wired; 3 templates compile; noop service available for tests.

---

## Phase 8 — Auth lifecycle endpoints

(Spec section 3.3 — 12 endpoints. Login already exists; we extend it. Each new endpoint is one task with TDD.)

### Task 8.1: Refresh-token guard + JWT strategy update

**Files:**
- Modify: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/auth/refresh-token.guard.ts`

- [ ] **Step 1: Replace jwt.strategy.ts**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';

export interface AccessJwtPayload {
  sub: number;
  username: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  establishmentIds: string[];
  passwordChangedAt: number | null;
  jti: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
    });
  }

  async validate(payload: AccessJwtPayload) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const userPwdChanged = user.passwordChangedAt?.getTime() ?? 0;
    if (payload.passwordChangedAt && userPwdChanged > payload.passwordChangedAt) {
      throw new UnauthorizedException('Password changed since token issued');
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        userId: user.id,
        organizationId: payload.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) throw new UnauthorizedException('Membership not active');

    return {
      id: user.id,
      sub: user.id,
      username: user.username,
      organizationId: payload.organizationId,
      organizationName: payload.organizationName,
      role: payload.role,
      establishmentIds: payload.establishmentIds,
      jti: payload.jti,
    };
  }
}
```

- [ ] **Step 2: Write refresh-token.guard.ts**

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.body?.refreshToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
      });
      if (payload.type !== 'refresh') throw new UnauthorizedException();
      req.refreshPayload = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
```

- [ ] **Step 3: Update auth.module.ts**

Replace `backend/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { RefreshToken } from './refresh-token.entity';
import { Invitation } from './invitation.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { SessionsService } from './sessions.service';
import { InvitationsService } from './invitations.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenGuard } from './refresh-token.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, Organization, OrganizationMembership, RefreshToken, Invitation,
      PasswordResetToken, UserEstablishmentAssignment,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
      signOptions: { expiresIn: '4h' },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionsService, InvitationsService, PasswordResetService, RefreshTokenGuard],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/jwt.strategy.ts backend/src/auth/refresh-token.guard.ts backend/src/auth/auth.module.ts
git commit -m "feat(auth): extend JWT with org context and refresh-token guard"
```

### Task 8.2: SessionsService — refresh-token CRUD with rotation

**Files:**
- Create: `backend/src/auth/sessions.service.ts`

- [ ] **Step 1: Write**

```typescript
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { RefreshToken } from './refresh-token.entity';

export interface IssuedRefresh {
  refreshToken: string;
  jti: string;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  private readonly TTL_DAYS = 30;

  constructor(
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private deviceLabelFromUserAgent(ua?: string | null): string | null {
    if (!ua) return null;
    if (/Chrome/i.test(ua) && /Mac/i.test(ua)) return 'Chrome en macOS';
    if (/Chrome/i.test(ua) && /Win/i.test(ua)) return 'Chrome en Windows';
    if (/Safari/i.test(ua) && /iPhone/i.test(ua)) return 'Safari en iPhone';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Edge/i.test(ua)) return 'Edge';
    return ua.slice(0, 60);
  }

  async issue(userId: number, organizationId: string, ip?: string, userAgent?: string | null, rotatedFromJti?: string): Promise<IssuedRefresh> {
    const jti = uuid();
    const refreshToken = this.jwt.sign(
      { sub: userId, jti, type: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
        expiresIn: `${this.TTL_DAYS}d`,
      },
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.repo.save(this.repo.create({
      jti,
      userId,
      organizationId,
      tokenHash: this.hashToken(refreshToken),
      deviceLabel: this.deviceLabelFromUserAgent(userAgent),
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      issuedAt: now,
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
      rotatedFromJti: rotatedFromJti ?? null,
    }));
    return { refreshToken, jti, expiresAt };
  }

  async rotate(presentedToken: string, presentedJti: string, userId: number, ip?: string, userAgent?: string | null): Promise<{ row: RefreshToken; issued: IssuedRefresh }> {
    const presented = await this.repo.findOne({ where: { jti: presentedJti } });
    if (!presented) throw new UnauthorizedException('Unknown refresh token');
    if (presented.userId !== userId) throw new UnauthorizedException();

    if (presented.revokedAt) {
      // Reuse attack: revoke all tokens for this user.
      await this.revokeAllForUser(userId);
      throw new ForbiddenException('Refresh token reuse detected; all sessions revoked');
    }
    if (this.hashToken(presentedToken) !== presented.tokenHash) {
      await this.revokeAllForUser(userId);
      throw new ForbiddenException('Refresh token hash mismatch; all sessions revoked');
    }
    if (presented.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    presented.revokedAt = new Date();
    presented.lastUsedAt = new Date();
    await this.repo.save(presented);

    const issued = await this.issue(userId, presented.organizationId, ip, userAgent, presented.jti);
    return { row: presented, issued };
  }

  async revokeByJti(userId: number, jti: string): Promise<void> {
    const t = await this.repo.findOne({ where: { jti } });
    if (!t || t.userId !== userId) throw new UnauthorizedException();
    if (!t.revokedAt) {
      t.revokedAt = new Date();
      await this.repo.save(t);
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
  }

  async listForUser(userId: number, currentJti: string): Promise<Array<{ jti: string; deviceLabel: string | null; lastUsedAt: Date; current: boolean }>> {
    const rows = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });
    return rows.map((r) => ({
      jti: r.jti,
      deviceLabel: r.deviceLabel,
      lastUsedAt: r.lastUsedAt,
      current: r.jti === currentJti,
    }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/sessions.service.ts
git commit -m "feat(auth): add SessionsService with rotation and reuse-attack detection"
```

### Task 8.3: AuthService — refactor login + extend with helpers

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Replace**

```typescript
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { SessionsService } from './sessions.service';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: number; username: string };
  organizations: Array<{ id: string; name: string; role: string }>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserEstablishmentAssignment) private readonly ueaRepo: Repository<UserEstablishmentAssignment>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  private emailHash(email: string) {
    return createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  async findUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | null> {
    const byUsername = await this.userRepo.findOne({ where: { username: usernameOrEmail } });
    if (byUsername) return byUsername;
    return this.userRepo.findOne({ where: { emailHash: this.emailHash(usernameOrEmail) } });
  }

  async signAccessToken(user: User, organizationId: string): Promise<{ accessToken: string; jti: string; orgName: string; role: OrgRole }> {
    const membership = await this.membershipRepo.findOne({
      where: { userId: user.id, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new UnauthorizedException('No active membership for this org');
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    const ueas = await this.ueaRepo.find({ where: { userId: user.id } });
    const jti = uuid();
    const accessToken = this.jwt.sign({
      sub: user.id,
      username: user.username,
      organizationId,
      organizationName: org?.name ?? '',
      role: membership.role,
      establishmentIds: ueas.map((u) => u.establishmentId),
      passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
      jti,
    });
    return { accessToken, jti, orgName: org?.name ?? '', role: membership.role };
  }

  async login(usernameOrEmail: string, password: string, ip?: string, userAgent?: string | null): Promise<LoginResult> {
    const user = await this.findUserByUsernameOrEmail(usernameOrEmail);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const memberships = await this.membershipRepo.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
    });
    if (memberships.length === 0) throw new UnauthorizedException('No memberships');

    const primary = memberships[0];
    const { accessToken } = await this.signAccessToken(user, primary.organizationId);
    const refresh = await this.sessions.issue(user.id, primary.organizationId, ip, userAgent);

    const orgs = await this.orgRepo.findByIds(memberships.map((m) => m.organizationId));
    return {
      accessToken,
      refreshToken: refresh.refreshToken,
      user: { id: user.id, username: user.username },
      organizations: orgs.map((o) => {
        const m = memberships.find((mm) => mm.organizationId === o.id)!;
        return { id: String(o.id), name: o.name, role: m.role };
      }),
    };
  }

  async switchOrg(userId: number, newOrgId: string): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const { accessToken } = await this.signAccessToken(user, newOrgId);
    return { accessToken };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) throw new BadRequestException('Password must be at least 12 chars');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    await this.userRepo.save(user);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/auth.service.ts
git commit -m "feat(auth): refactor AuthService for org-scoped tokens and lifecycle helpers"
```

### Task 8.4: DTOs for new endpoints

**Files:**
- Create: `backend/src/auth/dto/refresh.dto.ts`
- Create: `backend/src/auth/dto/switch-org.dto.ts`
- Create: `backend/src/auth/dto/forgot-password.dto.ts`
- Create: `backend/src/auth/dto/reset-password.dto.ts`
- Create: `backend/src/auth/dto/change-password.dto.ts`
- Create: `backend/src/auth/dto/invitation-preview.dto.ts`
- Create: `backend/src/auth/dto/invitation-accept.dto.ts`
- Modify: `backend/src/auth/dto/login.dto.ts`

- [ ] **Step 1: Replace login.dto.ts**

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  usernameOrEmail: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
```

- [ ] **Step 2: Write all other DTOs**

`refresh.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
export class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}
```

`switch-org.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
export class SwitchOrgDto {
  @IsString() @IsNotEmpty() organizationId: string;
}
```

`forgot-password.dto.ts`:

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';
export class ForgotPasswordDto {
  @IsEmail() @IsNotEmpty() email: string;
}
```

`reset-password.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
export class ResetPasswordDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(12) newPassword: string;
}
```

`change-password.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
export class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword: string;
  @IsString() @MinLength(12) newPassword: string;
}
```

`invitation-preview.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
export class InvitationPreviewDto {
  @IsString() @IsNotEmpty() token: string;
}
```

`invitation-accept.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
export class InvitationAcceptDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(12) password: string;
  @IsString() @IsNotEmpty() fullName: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/dto/
git commit -m "feat(auth): add DTOs for new auth endpoints"
```

### Task 8.5: Endpoint POST /api/auth/login (refactor)

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`
- Modify: `backend/test/auth.e2e-spec.ts`

- [ ] **Step 1: Update e2e test**

In `backend/test/auth.e2e-spec.ts`, replace existing login tests with:

```typescript
it('returns accessToken, refreshToken, user, organizations', async () => {
  await createUser(app, { username: 'loginuser' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ usernameOrEmail: 'loginuser', password: 'password123' })
    .expect(201);
  expect(res.body.accessToken).toBeDefined();
  expect(res.body.refreshToken).toBeDefined();
  expect(res.body.user).toMatchObject({ username: 'loginuser' });
  expect(Array.isArray(res.body.organizations)).toBe(true);
});

it('returns 401 for invalid password', async () => {
  await createUser(app, { username: 'loginuser' });
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ usernameOrEmail: 'loginuser', password: 'wrong' })
    .expect(401);
});
```

(Update `factories.ts` `createUser` if needed to also create an `Organization` + `OrganizationMembership` for the user.)

- [ ] **Step 2: Run — expect failures (existing controller still uses old contract)**

```bash
cd backend && npx jest test/auth.e2e-spec.ts
```

- [ ] **Step 3: Replace auth.controller.ts**

```typescript
import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const LOGIN_LIMIT = parseInt(
  process.env.THROTTLE_LOGIN_LIMIT ?? (process.env.NODE_ENV === 'production' ? '5' : '10000'),
  10,
);

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: LOGIN_LIMIT } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.usernameOrEmail, dto.password, req.ip, req.headers['user-agent']);
  }
}
```

- [ ] **Step 4: Run tests — PASS for login**

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/auth.controller.ts backend/test/auth.e2e-spec.ts backend/test/factories.ts
git commit -m "feat(auth): refactor /api/auth/login response shape"
```

### Task 8.6: Endpoint POST /api/auth/refresh

- [ ] **Step 1: Add e2e test in `auth.e2e-spec.ts`**

```typescript
it('rotates refresh token and rejects reuse', async () => {
  const u = await createUser(app, { username: 'refreshuser' });
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ usernameOrEmail: 'refreshuser', password: 'password123' });
  const r1 = login.body.refreshToken;

  const refresh1 = await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({ refreshToken: r1 })
    .expect(201);
  expect(refresh1.body.refreshToken).toBeDefined();

  // Reuse old token: must 403 and revoke entire chain
  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({ refreshToken: r1 })
    .expect(403);
});
```

- [ ] **Step 2: Run — FAIL** (endpoint missing).

- [ ] **Step 3: Add handler in controller**

In `auth.controller.ts` add:

```typescript
import { UseGuards } from '@nestjs/common';
import { RefreshTokenGuard } from './refresh-token.guard';
import { RefreshDto } from './dto/refresh.dto';

@Post('refresh')
@UseGuards(RefreshTokenGuard)
async refresh(@Body() dto: RefreshDto, @Req() req: any) {
  return this.authService.refresh(dto.refreshToken, req.refreshPayload, req.ip, req.headers['user-agent']);
}
```

- [ ] **Step 4: Add `refresh()` to AuthService**

```typescript
async refresh(refreshToken: string, payload: { sub: number; jti: string }, ip?: string, ua?: string | null) {
  const user = await this.userRepo.findOne({ where: { id: payload.sub } });
  if (!user) throw new UnauthorizedException();
  const { row, issued } = await this.sessions.rotate(refreshToken, payload.jti, payload.sub, ip, ua);
  const { accessToken } = await this.signAccessToken(user, row.organizationId);
  return { accessToken, refreshToken: issued.refreshToken };
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/auth.controller.ts backend/src/auth/auth.service.ts backend/test/auth.e2e-spec.ts
git commit -m "feat(auth): add /api/auth/refresh with rotation and reuse detection"
```

### Task 8.7: Endpoint POST /api/auth/logout

- [ ] **Step 1: Test**

```typescript
it('logs out current refresh token', async () => {
  const login = await loginAs(app, 'logoutuser');
  await request(app.getHttpServer())
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ refreshToken: login.body.refreshToken })
    .expect(204);
  // reusing same refresh now fails
  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
});
```

- [ ] **Step 2: FAIL → implement**

In controller:

```typescript
import { HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Post('logout')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(JwtAuthGuard)
async logout(@Body() dto: RefreshDto, @CurrentUser() user: any) {
  // best-effort: decode to find jti
  const payload = this.jwt.decode(dto.refreshToken) as any;
  if (payload?.jti) {
    await this.sessions.revokeByJti(user.id, payload.jti);
  }
}
```

Inject `JwtService` and `SessionsService` into the controller.

- [ ] **Step 3: PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(auth): add /api/auth/logout"
```

### Task 8.8: Endpoint POST /api/auth/logout-all

- [ ] **Step 1: Test**

```typescript
it('revokes all sessions and bumps passwordChangedAt', async () => {
  const a = await loginAs(app, 'logoutall');
  const b = await loginAs(app, 'logoutall'); // second device
  await request(app.getHttpServer())
    .post('/api/auth/logout-all')
    .set('Authorization', `Bearer ${a.body.accessToken}`)
    .expect(204);
  await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .send({ refreshToken: b.body.refreshToken })
    .expect(401);
});
```

- [ ] **Step 2: Implement in controller + AuthService**

Controller:

```typescript
@Post('logout-all')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(JwtAuthGuard)
async logoutAll(@CurrentUser() user: any) {
  await this.authService.logoutAll(user.id);
}
```

AuthService:

```typescript
async logoutAll(userId: number) {
  await this.sessions.revokeAllForUser(userId);
  await this.userRepo.update(userId, { passwordChangedAt: new Date() });
}
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/logout-all"
```

### Task 8.9: Endpoint GET /api/auth/sessions

- [ ] **Step 1: Test**

```typescript
it('lists active sessions with current flag', async () => {
  const a = await loginAs(app, 'sessionsuser');
  const res = await request(app.getHttpServer())
    .get('/api/auth/sessions')
    .set('Authorization', `Bearer ${a.body.accessToken}`)
    .expect(200);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.body.find((s: any) => s.current)).toBeDefined();
});
```

- [ ] **Step 2: Implement**

```typescript
import { Get } from '@nestjs/common';

@Get('sessions')
@UseGuards(JwtAuthGuard)
async listSessions(@CurrentUser() user: any) {
  return this.sessions.listForUser(user.id, user.jti);
}
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add GET /api/auth/sessions"
```

### Task 8.10: Endpoint DELETE /api/auth/sessions/:jti

- [ ] **Step 1: Test**

```typescript
it('revokes specific session', async () => {
  const a = await loginAs(app, 'revokeuser');
  const list = await request(app.getHttpServer())
    .get('/api/auth/sessions')
    .set('Authorization', `Bearer ${a.body.accessToken}`);
  const otherJti = list.body[0].jti; // current
  await request(app.getHttpServer())
    .delete(`/api/auth/sessions/${otherJti}`)
    .set('Authorization', `Bearer ${a.body.accessToken}`)
    .expect(204);
});
```

- [ ] **Step 2: Implement**

```typescript
import { Delete, Param } from '@nestjs/common';

@Delete('sessions/:jti')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(JwtAuthGuard)
async revokeSession(@Param('jti') jti: string, @CurrentUser() user: any) {
  await this.sessions.revokeByJti(user.id, jti);
}
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add DELETE /api/auth/sessions/:jti"
```

### Task 8.11: Endpoint POST /api/auth/switch-org

- [ ] **Step 1: Test**

```typescript
it('issues new access token for different org', async () => {
  const a = await loginAs(app, 'switcher', { secondOrg: true });
  const res = await request(app.getHttpServer())
    .post('/api/auth/switch-org')
    .set('Authorization', `Bearer ${a.body.accessToken}`)
    .send({ organizationId: a.body.organizations[1].id })
    .expect(201);
  expect(res.body.accessToken).toBeDefined();
});
```

- [ ] **Step 2: Implement**

Controller:

```typescript
@Post('switch-org')
@UseGuards(JwtAuthGuard)
async switchOrg(@Body() dto: SwitchOrgDto, @CurrentUser() user: any) {
  return this.authService.switchOrg(user.id, dto.organizationId);
}
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/switch-org"
```

### Task 8.12: Endpoint POST /api/auth/forgot-password

- [ ] **Step 1: Test**

```typescript
it('always returns 204 (anti-enumeration)', async () => {
  await request(app.getHttpServer())
    .post('/api/auth/forgot-password')
    .send({ email: 'unknown@test.cl' })
    .expect(204);
});
```

- [ ] **Step 2: Write PasswordResetService**

`backend/src/auth/password-reset.service.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/user.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { EMAIL_SERVICE, EmailService } from '../email/email.service';
import { PasswordResetEmail } from '../email/templates/PasswordResetEmail';
import * as React from 'react';

@Injectable()
export class PasswordResetService {
  private readonly TTL_MIN = 60;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetToken) private readonly resetRepo: Repository<PasswordResetToken>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async forgot(email: string): Promise<void> {
    const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
    const user = await this.userRepo.findOne({ where: { emailHash } });
    if (!user) return; // anti-enumeration: return 204 silently
    const token = randomBytes(32).toString('base64url');
    await this.resetRepo.save(this.resetRepo.create({
      userId: user.id,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + this.TTL_MIN * 60 * 1000),
    }));
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await this.email.send({
      to: email,
      subject: 'Restablecé tu contraseña',
      react: React.createElement(PasswordResetEmail, {
        resetUrl: `${baseUrl}/reset-password?token=${token}`,
        expiresInMinutes: this.TTL_MIN,
      }),
    });
  }

  async findValidToken(token: string): Promise<PasswordResetToken | null> {
    const row = await this.resetRepo.findOne({ where: { tokenHash: this.hash(token) } });
    if (!row) return null;
    if (row.usedAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async markUsed(id: string): Promise<void> {
    await this.resetRepo.update(id, { usedAt: new Date() });
  }
}
```

- [ ] **Step 3: Controller**

```typescript
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { Inject } from '@nestjs/common';

@Post('forgot-password')
@HttpCode(HttpStatus.NO_CONTENT)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  await this.passwordReset.forgot(dto.email);
}
```

Inject `PasswordResetService` into controller.

- [ ] **Step 4: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/forgot-password (anti-enumeration)"
```

### Task 8.13: Endpoint POST /api/auth/reset-password

- [ ] **Step 1: Test**

```typescript
it('resets password and auto-logs in', async () => {
  const u = await createUserWithEmail(app, 'reset@test.cl');
  await request(app.getHttpServer())
    .post('/api/auth/forgot-password')
    .send({ email: 'reset@test.cl' });
  const token = capturedNoopEmailToken(); // from NoopEmailService spy
  const res = await request(app.getHttpServer())
    .post('/api/auth/reset-password')
    .send({ token, newPassword: 'new-strong-password-12' })
    .expect(201);
  expect(res.body.accessToken).toBeDefined();
});
```

- [ ] **Step 2: Implement**

Controller:

```typescript
import { ResetPasswordDto } from './dto/reset-password.dto';

@Post('reset-password')
async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
  return this.authService.resetPassword(dto.token, dto.newPassword, req.ip, req.headers['user-agent']);
}
```

AuthService:

```typescript
async resetPassword(token: string, newPassword: string, ip?: string, ua?: string | null) {
  const row = await this.passwordReset.findValidToken(token);
  if (!row) throw new UnauthorizedException('Invalid or expired token');
  const user = await this.userRepo.findOne({ where: { id: row.userId } });
  if (!user) throw new UnauthorizedException();
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  await this.userRepo.save(user);
  await this.passwordReset.markUsed(row.id);
  await this.sessions.revokeAllForUser(user.id);
  // auto-login on first membership
  const m = await this.membershipRepo.findOne({ where: { userId: user.id, status: MembershipStatus.ACTIVE } });
  if (!m) throw new UnauthorizedException('No memberships');
  const { accessToken } = await this.signAccessToken(user, m.organizationId);
  const refresh = await this.sessions.issue(user.id, m.organizationId, ip, ua);
  return { accessToken, refreshToken: refresh.refreshToken };
}
```

Inject `PasswordResetService` into AuthService constructor.

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/reset-password with auto-login"
```

### Task 8.14: Endpoint POST /api/auth/change-password

- [ ] **Step 1: Test**

```typescript
it('changes password and revokes prior sessions', async () => {
  const a = await loginAs(app, 'changer');
  await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${a.body.accessToken}`)
    .send({ currentPassword: 'password123', newPassword: 'new-strong-pwd-12' })
    .expect(204);
});
```

- [ ] **Step 2: Implement**

Controller:

```typescript
import { ChangePasswordDto } from './dto/change-password.dto';

@Post('change-password')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(JwtAuthGuard)
async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: any, @Req() req: Request) {
  await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  await this.sessions.revokeAllForUser(user.id);
  // notify
  const u = await this.authService.userById(user.id);
  if (u?.emailHash) {
    // best-effort send via passwordReset.email path or inject EmailService here
  }
}
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/change-password"
```

### Task 8.15: Endpoint POST /api/auth/invitations/preview

- [ ] **Step 1: Write InvitationsService**

`backend/src/auth/invitations.service.ts`:

```typescript
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as React from 'react';
import { Invitation } from './invitation.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationMembership, OrgRole, MembershipStatus } from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { EMAIL_SERVICE, EmailService } from '../email/email.service';
import { InvitationEmail } from '../email/templates/InvitationEmail';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly invRepo: Repository<Invitation>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  private hash(s: string): string { return createHash('sha256').update(s).digest('hex'); }

  async create(organizationId: string, inviterId: number, inviterName: string, email: string, role: OrgRole): Promise<{ invitation: Invitation; token: string }> {
    const token = randomBytes(32).toString('base64url');
    const inv = this.invRepo.create({
      organizationId,
      email,
      role,
      invitedById: inviterId,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const saved = await this.invRepo.save(inv);
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await this.email.send({
      to: email,
      subject: `Invitación para unirte a ${org?.name}`,
      react: React.createElement(InvitationEmail, {
        inviteeEmail: email,
        organizationName: org?.name ?? '',
        inviterName,
        role,
        acceptUrl: `${baseUrl}/accept-invitation?token=${token}`,
        expiresInDays: 7,
      }),
    });
    return { invitation: saved, token };
  }

  async findValid(token: string): Promise<Invitation | null> {
    const row = await this.invRepo.findOne({ where: { tokenHash: this.hash(token) } });
    if (!row) return null;
    if (row.acceptedAt || row.cancelledAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async preview(token: string) {
    const inv = await this.findValid(token);
    if (!inv) return { valid: false };
    const org = await this.orgRepo.findOne({ where: { id: inv.organizationId } });
    return {
      valid: true,
      organizationName: org?.name ?? '',
      role: inv.role,
      email: inv.email,
    };
  }

  async accept(token: string, password: string, fullName: string): Promise<User> {
    const inv = await this.findValid(token);
    if (!inv) throw new BadRequestException('Invalid or expired invitation');
    const emailHash = createHash('sha256').update(inv.email.toLowerCase()).digest('hex');
    let user = await this.userRepo.findOne({ where: { emailHash } });
    if (!user) {
      user = this.userRepo.create({
        username: fullName,
        passwordHash: await bcrypt.hash(password, 10),
        emailHash,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
      });
      user = await this.userRepo.save(user);
    }
    await this.memRepo.save(this.memRepo.create({
      userId: user.id,
      organizationId: inv.organizationId,
      role: inv.role,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    }));
    inv.acceptedAt = new Date();
    await this.invRepo.save(inv);
    return user;
  }
}
```

- [ ] **Step 2: Test**

```typescript
it('previews valid invitation', async () => {
  const token = await seedInvitation(app);
  const res = await request(app.getHttpServer())
    .post('/api/auth/invitations/preview')
    .send({ token })
    .expect(201);
  expect(res.body.valid).toBe(true);
});
```

- [ ] **Step 3: Controller**

```typescript
import { InvitationPreviewDto } from './dto/invitation-preview.dto';

@Post('invitations/preview')
async previewInvitation(@Body() dto: InvitationPreviewDto) {
  return this.invitations.preview(dto.token);
}
```

Inject `InvitationsService`.

- [ ] **Step 4: PASS, commit**

```bash
git add backend/src/auth/invitations.service.ts backend/src/auth/auth.controller.ts backend/test/auth.e2e-spec.ts
git commit -m "feat(auth): add /api/auth/invitations/preview"
```

### Task 8.16: Endpoint POST /api/auth/invitations/accept

- [ ] **Step 1: Test**

```typescript
it('creates user, membership, returns access+refresh', async () => {
  const token = await seedInvitation(app, { email: 'newbie@test.cl' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/invitations/accept')
    .send({ token, password: 'super-strong-pwd-12', fullName: 'Newbie' })
    .expect(201);
  expect(res.body.accessToken).toBeDefined();
  expect(res.body.refreshToken).toBeDefined();
});
```

- [ ] **Step 2: Implement**

Controller:

```typescript
import { InvitationAcceptDto } from './dto/invitation-accept.dto';

@Post('invitations/accept')
async acceptInvitation(@Body() dto: InvitationAcceptDto, @Req() req: Request) {
  const user = await this.invitations.accept(dto.token, dto.password, dto.fullName);
  const memberships = await this.authService.findMemberships(user.id);
  const m = memberships[0];
  const { accessToken } = await this.authService.signAccessToken(user, m.organizationId);
  const refresh = await this.sessions.issue(user.id, m.organizationId, req.ip, req.headers['user-agent']);
  return { accessToken, refreshToken: refresh.refreshToken };
}
```

Add `findMemberships` to `AuthService`:

```typescript
async findMemberships(userId: number) {
  return this.membershipRepo.find({ where: { userId, status: MembershipStatus.ACTIVE } });
}
async userById(id: number) { return this.userRepo.findOne({ where: { id } }); }
```

- [ ] **Step 3: PASS, commit**

```bash
git commit -am "feat(auth): add /api/auth/invitations/accept with auto-login"
```

**Phase 8 complete when:** all 12 endpoints have e2e tests passing; controller compiles; refresh rotation + reuse-attack covered; passwordChangedAt invariant enforced in JwtStrategy.

---

## Phase 9 — CLI tools

(Spec sections 6.1, 4.3.)

### Task 9.1: CLI admin:create-org

**Files:**
- Create: `backend/src/cli/admin-create-org.ts`

- [ ] **Step 1: Write**

```typescript
/**
 * Usage: npm run admin:create-org -- \
 *   --name "CESFAM Lo Espejo" \
 *   --owner-email "director@cesfamloespejo.cl" \
 *   --owner-name "Dra. Patricia Soto" \
 *   --tier pilot \
 *   --establishment "Sede principal"
 */
import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { Organization, OrganizationTier, OrganizationStatus } from '../organizations/organization.entity';
import { Establishment } from '../establishments/establishment.entity';
import { InvitationsService } from '../auth/invitations.service';
import { OrgRole } from '../organizations/organization-membership.entity';
import { runWithBypass } from '../common/org-context';
import { User } from '../users/user.entity';

async function main() {
  const program = new Command();
  program
    .requiredOption('--name <name>')
    .requiredOption('--owner-email <email>')
    .requiredOption('--owner-name <name>')
    .option('--tier <tier>', 'free|pilot|paid', 'pilot')
    .option('--establishment <name>', 'Default establishment name', 'Sede principal')
    .option('--comuna <comuna>', 'Establishment comuna', 'Sin especificar');
  program.parse(process.argv);
  const opts = program.opts();

  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);
  const invitations = app.get(InvitationsService);

  await runWithBypass(async () => {
    const orgRepo = ds.getRepository(Organization);
    const estRepo = ds.getRepository(Establishment);
    const userRepo = ds.getRepository(User);

    const org = await orgRepo.save(orgRepo.create({
      name: opts.name,
      tier: opts.tier as OrganizationTier,
      status: OrganizationStatus.ACTIVE,
    }));

    await estRepo.save(estRepo.create({
      name: opts.establishment,
      comuna: opts.comuna,
      organizationId: org.id,
    }));

    // System inviter: pick first existing admin user, else fallback to user id 1.
    const inviter = await userRepo.find({ order: { id: 'ASC' }, take: 1 });
    const inviterId = inviter[0]?.id ?? 1;

    const { token } = await invitations.create(
      org.id,
      inviterId,
      'Sistema',
      opts.ownerEmail,
      OrgRole.OWNER,
    );

    console.log(`[admin:create-org] org=${org.id} name="${org.name}"`);
    console.log(`[admin:create-org] invitation token: ${token}`);
    console.log(`[admin:create-org] invitation email sent to ${opts.ownerEmail}`);
  });

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test locally**

```bash
cd backend && npm run admin:create-org -- --name "Test Org" --owner-email "test@test.cl" --owner-name "Test Owner"
```

Expected: org created, token logged.

- [ ] **Step 3: Commit**

```bash
git add backend/src/cli/admin-create-org.ts
git commit -m "feat(cli): add admin:create-org"
```

### Task 9.2: CLI audit:verify

**Files:**
- Create: `backend/src/cli/audit-verify.ts`

- [ ] **Step 1: Write**

```typescript
/**
 * Usage: npm run audit:verify -- --org 7
 */
import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { AuditChainService } from '../audit-log/audit-chain.service';

async function main() {
  const program = new Command();
  program.requiredOption('--org <organizationId>');
  program.parse(process.argv);
  const opts = program.opts();

  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);
  const chain = app.get(AuditChainService);

  const rows = await ds.query(
    `SELECT id, "userId", "organizationId", action, entity, "entityId",
            "beforeJson", "afterJson", "createdAt", "requestId",
            "payloadHash", "prevHash", "chainHash"
     FROM "audit_logs" WHERE "organizationId" = $1 ORDER BY id ASC`,
    [opts.org],
  );

  let prev: string | null = null;
  let ok = 0;
  for (const r of rows) {
    const payloadHash = chain.computePayloadHash(r);
    const chainHash = chain.computeChainHash(prev, payloadHash);
    if (payloadHash !== r.payloadHash || chainHash !== r.chainHash || prev !== r.prevHash) {
      console.error(`[audit:verify] MISMATCH at row id=${r.id}`);
      process.exit(2);
    }
    prev = chainHash;
    ok++;
  }
  console.log(`[audit:verify] OK — ${ok} rows verified for org ${opts.org}`);
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Smoke test**

```bash
cd backend && npm run audit:verify -- --org 1
```

Expected: `[audit:verify] OK — N rows verified for org 1`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/cli/audit-verify.ts
git commit -m "feat(cli): add audit:verify"
```

### Task 9.3: Document CLIs in README

**Files:**
- Modify: `backend/README.md` (create if missing)

- [ ] **Step 1: Append**

```markdown
## Operational CLIs

### Provision a new organization

```bash
npm run admin:create-org -- \
  --name "CESFAM Lo Espejo" \
  --owner-email "director@cesfamloespejo.cl" \
  --owner-name "Dra. Patricia Soto" \
  --tier pilot \
  --establishment "Sede principal"
```

Sends an invitation email via Resend. The owner accepts at `${FRONTEND_URL}/accept-invitation?token=...`.

### Verify the audit log hash chain

```bash
npm run audit:verify -- --org 1
```

Exits with code 2 on any mismatch (= tampering).

### Encryption backfill (one-shot, idempotent)

```bash
npm run encryption:backfill
```

Walks tenanted entities and encrypts the v1 sensitive fields. Skips rows that are already encrypted.
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs(backend): document admin CLIs"
```

**Phase 9 complete when:** both CLIs run end-to-end against a local DB; README updated.

---

## Phase 10 — Frontend updates

(Spec section 6.3.)

### Task 10.1: AuthContext — extend for org/role/refresh

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Replace**

```typescript
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, switchOrg as apiSwitchOrg } from '../services/api';

const ACCESS_KEY = 'curaciones_access_token';
const REFRESH_KEY = 'curaciones_refresh_token';
const USER_KEY = 'curaciones_user';
const ORGS_KEY = 'curaciones_orgs';
const CURRENT_ORG_KEY = 'curaciones_current_org';

export interface AuthUser { id: number; username: string; }
export interface OrgSummary { id: string; name: string; role: string; }

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  switchOrg: (organizationId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = localStorage.getItem(ACCESS_KEY);
    const r = localStorage.getItem(REFRESH_KEY);
    const u = localStorage.getItem(USER_KEY);
    const o = localStorage.getItem(ORGS_KEY);
    const co = localStorage.getItem(CURRENT_ORG_KEY);
    if (a && u) {
      setAccessToken(a);
      setRefreshToken(r);
      try { setUser(JSON.parse(u)); } catch {}
      try { setOrganizations(JSON.parse(o ?? '[]')); } catch {}
      try { setCurrentOrg(co ? JSON.parse(co) : null); } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const data = await apiLogin(usernameOrEmail, password);
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(ORGS_KEY, JSON.stringify(data.organizations));
    const co = data.organizations[0];
    localStorage.setItem(CURRENT_ORG_KEY, JSON.stringify(co));
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    setOrganizations(data.organizations);
    setCurrentOrg(co);
  }, []);

  const switchOrg = useCallback(async (organizationId: string) => {
    const data = await apiSwitchOrg(organizationId);
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    setAccessToken(data.accessToken);
    const co = organizations.find((o) => o.id === organizationId) ?? null;
    if (co) {
      localStorage.setItem(CURRENT_ORG_KEY, JSON.stringify(co));
      setCurrentOrg(co);
    }
  }, [organizations]);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORGS_KEY);
    localStorage.removeItem(CURRENT_ORG_KEY);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, refreshToken, organizations, currentOrg, login, switchOrg, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx
git commit -m "feat(frontend): extend AuthContext with orgs, role, refresh tokens"
```

### Task 10.2: api.ts — refresh interceptor + new endpoints

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Replace token logic at top of file**

Replace the request interceptor + 401 handler with:

```typescript
const ACCESS_KEY = 'curaciones_access_token';
const REFRESH_KEY = 'curaciones_refresh_token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const r = localStorage.getItem(REFRESH_KEY);
  if (!r) return null;
  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL}/auth/refresh`,
      { refreshToken: r },
    );
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.includes('/auth/login') ||
                       original?.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !isAuthCall && !original._retry) {
      original._retry = true;
      if (!refreshing) refreshing = refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
```

- [ ] **Step 2: Replace `login` and add new auth endpoints**

```typescript
export const login = async (usernameOrEmail: string, password: string) => {
  const { data } = await api.post('/auth/login', { usernameOrEmail, password });
  return data;
};

export const switchOrg = async (organizationId: string) => {
  const { data } = await api.post('/auth/switch-org', { organizationId });
  return data;
};

export const logoutCurrent = async (refreshToken: string) =>
  api.post('/auth/logout', { refreshToken });

export const logoutAll = async () => api.post('/auth/logout-all');

export const listSessions = async () => {
  const { data } = await api.get('/auth/sessions');
  return data as Array<{ jti: string; deviceLabel: string | null; lastUsedAt: string; current: boolean }>;
};

export const revokeSession = async (jti: string) => api.delete(`/auth/sessions/${jti}`);

export const forgotPassword = async (email: string) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = async (token: string, newPassword: string) => {
  const { data } = await api.post('/auth/reset-password', { token, newPassword });
  return data;
};

export const changePassword = async (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

export const previewInvitation = async (token: string) => {
  const { data } = await api.post('/auth/invitations/preview', { token });
  return data;
};

export const acceptInvitation = async (token: string, password: string, fullName: string) => {
  const { data } = await api.post('/auth/invitations/accept', { token, password, fullName });
  return data;
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(frontend): add refresh interceptor and auth lifecycle calls"
```

### Task 10.3: OrgSwitcher component

**Files:**
- Create: `frontend/src/components/OrgSwitcher.tsx`

- [ ] **Step 1: Write**

```tsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui';

export function OrgSwitcher() {
  const { organizations, currentOrg, switchOrg } = useAuth();
  const [open, setOpen] = useState(false);
  if (organizations.length <= 1) {
    return (
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {currentOrg?.name ?? ''}
      </span>
    );
  }
  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        {currentOrg?.name ?? 'Seleccionar organización'}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50">
          {organizations.map((o) => (
            <button
              key={o.id}
              // eslint-disable-next-line ui/use-primitives
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${o.id === currentOrg?.id ? 'font-semibold' : ''}`}
              onClick={async () => {
                await switchOrg(o.id);
                setOpen(false);
                window.location.reload();
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OrgSwitcher.tsx
git commit -m "feat(frontend): add OrgSwitcher component"
```

### Task 10.4: Layout — render OrgSwitcher + account dropdown

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Insert OrgSwitcher near the top bar**

In `Layout.tsx`, around line 254 (the `<div className="ml-auto flex items-center gap-3">` block), add:

```tsx
import { OrgSwitcher } from './OrgSwitcher';
// ...
<OrgSwitcher />
```

- [ ] **Step 2: Add Mi cuenta + Mi organización nav links** in the admin nav block (around lines 113-180), guarded by role:

Append after the existing admin links:

```tsx
{(user as any)?.role && (
  <NavLink to="/account/sessions" className={/* same className helper */}>
    Mi cuenta
  </NavLink>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat(frontend): render OrgSwitcher and account links in Layout"
```

### Task 10.5: AcceptInvitationPage

**Files:**
- Create: `frontend/src/pages/AcceptInvitationPage.tsx`

- [ ] **Step 1: Write**

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { previewInvitation, acceptInvitation } from '../services/api';
import { Button, Input, PageHeader, Card } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [preview, setPreview] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    previewInvitation(token).then(setPreview).catch(() => setPreview({ valid: false }));
  }, [token]);

  if (!preview) return <div>Cargando…</div>;
  if (!preview.valid) return <Card>Invitación inválida o expirada.</Card>;

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader title="Aceptar invitación" subtitle={`Te invitaron a ${preview.organizationName} como ${preview.role}`} />
      <Card>
        <Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" value={preview.email} disabled />
        <Input label="Contraseña (mínimo 12 caracteres)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirmar contraseña" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button
          disabled={submitting || password.length < 12 || password !== confirm}
          onClick={async () => {
            setSubmitting(true);
            try {
              const data = await acceptInvitation(token, password, fullName);
              localStorage.setItem('curaciones_access_token', data.accessToken);
              localStorage.setItem('curaciones_refresh_token', data.refreshToken);
              navigate('/');
            } catch (e: any) {
              toast.error(e?.response?.data?.message ?? 'Error');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Aceptar e ingresar
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AcceptInvitationPage.tsx
git commit -m "feat(frontend): add AcceptInvitationPage"
```

### Task 10.6: ForgotPasswordPage

**Files:**
- Create: `frontend/src/pages/ForgotPasswordPage.tsx`

- [ ] **Step 1: Write**

```tsx
import { useState } from 'react';
import { forgotPassword } from '../services/api';
import { Button, Input, Card, PageHeader } from '../components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader title="¿Olvidaste tu contraseña?" />
      <Card>
        {sent ? (
          <p>Si ese email existe en el sistema, recibirás un correo con instrucciones.</p>
        ) : (
          <>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button
              disabled={!email}
              onClick={async () => { await forgotPassword(email); setSent(true); }}
            >
              Enviar link
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(frontend): add ForgotPasswordPage"
```

### Task 10.7: ResetPasswordPage

**Files:**
- Create: `frontend/src/pages/ResetPasswordPage.tsx`

- [ ] **Step 1: Write**

```tsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../services/api';
import { Button, Input, Card, PageHeader } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader title="Crear nueva contraseña" />
      <Card>
        <Input label="Nueva contraseña" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Input label="Confirmar" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button
          disabled={pwd.length < 12 || pwd !== confirm}
          onClick={async () => {
            try {
              const data = await resetPassword(token, pwd);
              localStorage.setItem('curaciones_access_token', data.accessToken);
              localStorage.setItem('curaciones_refresh_token', data.refreshToken);
              navigate('/');
            } catch (e: any) {
              toast.error(e?.response?.data?.message ?? 'Error');
            }
          }}
        >
          Cambiar contraseña
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(frontend): add ResetPasswordPage"
```

### Task 10.8: SessionsPage

**Files:**
- Create: `frontend/src/pages/account/SessionsPage.tsx`

- [ ] **Step 1: Write**

```tsx
import { useEffect, useState } from 'react';
import { listSessions, revokeSession, logoutAll } from '../../services/api';
import { Button, DataTable, PageHeader, ColumnDef } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

interface Row { jti: string; deviceLabel: string | null; lastUsedAt: string; current: boolean; }

export default function SessionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const toast = useToast();

  const reload = async () => setRows(await listSessions());
  useEffect(() => { reload(); }, []);

  const cols: ColumnDef<Row>[] = [
    { header: 'Dispositivo', key: 'deviceLabel', cell: (r) => r.deviceLabel ?? '—' },
    { header: 'Último uso', key: 'lastUsedAt', cell: (r) => new Date(r.lastUsedAt).toLocaleString('es-CL') },
    { header: 'Actual', key: 'current', cell: (r) => r.current ? 'Sí' : '' },
    {
      header: '',
      key: 'actions',
      cell: (r) => r.current ? null : (
        <Button variant="danger" size="sm" onClick={async () => { await revokeSession(r.jti); reload(); }}>
          Revocar
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sesiones activas"
        subtitle="Revisá los dispositivos conectados a tu cuenta"
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              await logoutAll();
              toast.success('Todas las sesiones cerradas');
              window.location.href = '/login';
            }}
          >
            Cerrar todas las sesiones
          </Button>
        }
      />
      <DataTable columns={cols} data={rows} keyExtractor={(r) => r.jti} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(frontend): add SessionsPage"
```

### Task 10.9: ChangePasswordPage

**Files:**
- Create: `frontend/src/pages/account/ChangePasswordPage.tsx`

- [ ] **Step 1: Write**

```tsx
import { useState } from 'react';
import { changePassword } from '../../services/api';
import { Button, Input, Card, PageHeader } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const toast = useToast();

  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Card>
        <Input label="Contraseña actual" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label="Nueva contraseña" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input label="Confirmar" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button
          disabled={!current || next.length < 12 || next !== confirm}
          onClick={async () => {
            try {
              await changePassword(current, next);
              toast.success('Contraseña actualizada. Volvé a iniciar sesión.');
              localStorage.clear();
              window.location.href = '/login';
            } catch (e: any) {
              toast.error(e?.response?.data?.message ?? 'Error');
            }
          }}
        >
          Cambiar contraseña
        </Button>
      </Card>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(frontend): add ChangePasswordPage"
```

### Task 10.10: Mi organización — MembersPage

**Files:**
- Create: `frontend/src/pages/org/MembersPage.tsx`
- Modify: `frontend/src/services/api.ts` (add org endpoints)

- [ ] **Step 1: Add API calls**

In `frontend/src/services/api.ts`:

```typescript
export const listMembers = async () => (await api.get('/org/members')).data;
export const inviteMember = async (email: string, role: string) =>
  (await api.post('/org/invitations', { email, role })).data;
export const updateMemberRole = async (userId: number, role: string) =>
  (await api.patch(`/org/members/${userId}`, { role })).data;
export const revokeMember = async (userId: number) =>
  api.delete(`/org/members/${userId}`);
```

- [ ] **Step 2: Page**

```tsx
import { useEffect, useState } from 'react';
import { listMembers, inviteMember, updateMemberRole, revokeMember } from '../../services/api';
import { Button, Input, Select, PageHeader, DataTable, ColumnDef, Modal } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface Member { userId: number; username: string; email: string; role: string; status: string; }

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('clinician');
  const toast = useToast();
  const confirm = useConfirm();

  const reload = async () => setMembers(await listMembers());
  useEffect(() => { reload(); }, []);

  const cols: ColumnDef<Member>[] = [
    { header: 'Usuario', key: 'username', cell: (m) => m.username },
    { header: 'Email', key: 'email', cell: (m) => m.email },
    {
      header: 'Rol',
      key: 'role',
      cell: (m) => (
        <Select
          value={m.role}
          onChange={async (e) => { await updateMemberRole(m.userId, e.target.value); reload(); }}
          options={[
            { value: 'owner', label: 'Owner' },
            { value: 'admin', label: 'Admin' },
            { value: 'clinician', label: 'Clinician' },
            { value: 'receptionist', label: 'Receptionist' },
          ]}
        />
      ),
    },
    {
      header: '',
      key: 'actions',
      cell: (m) => (
        <Button variant="danger" size="sm" onClick={async () => {
          if (await confirm({ title: 'Revocar acceso', message: `¿Revocar a ${m.username}?` })) {
            await revokeMember(m.userId);
            reload();
          }
        }}>Revocar</Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Miembros"
        actions={<Button onClick={() => setOpen(true)}>Invitar</Button>}
      />
      <DataTable columns={cols} data={members} keyExtractor={(m) => String(m.userId)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Invitar a un nuevo miembro">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: 'admin', label: 'Admin' },
            { value: 'clinician', label: 'Clinician' },
            { value: 'receptionist', label: 'Receptionist' },
          ]}
        />
        <Button
          onClick={async () => {
            try {
              await inviteMember(email, role);
              toast.success('Invitación enviada');
              setOpen(false);
              setEmail('');
            } catch (e: any) {
              toast.error(e?.response?.data?.message ?? 'Error');
            }
          }}
        >
          Enviar invitación
        </Button>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/pages/org/MembersPage.tsx
git commit -m "feat(frontend): add Mi Organización - Members page"
```

### Task 10.11: InvitationsPage / EstablishmentsPage / SettingsPage

**Files:**
- Create: `frontend/src/pages/org/InvitationsPage.tsx`
- Create: `frontend/src/pages/org/EstablishmentsPage.tsx`
- Create: `frontend/src/pages/org/SettingsPage.tsx`

- [ ] **Step 1: InvitationsPage** — list pending invites with cancel/resend

```tsx
import { useEffect, useState } from 'react';
import api from '../../services/api'; // adjust if api.ts default-exports
import { Button, PageHeader, DataTable, ColumnDef } from '../../components/ui';

interface Invite { id: string; email: string; role: string; createdAt: string; expiresAt: string; }

export default function InvitationsPage() {
  const [rows, setRows] = useState<Invite[]>([]);
  const reload = async () => {
    const { data } = await (await import('../../services/api')).default!.get?.('/org/invitations') ?? { data: [] };
    setRows(data);
  };
  useEffect(() => { reload(); }, []);
  const cols: ColumnDef<Invite>[] = [
    { header: 'Email', key: 'email', cell: (i) => i.email },
    { header: 'Rol', key: 'role', cell: (i) => i.role },
    { header: 'Expira', key: 'expiresAt', cell: (i) => new Date(i.expiresAt).toLocaleDateString('es-CL') },
  ];
  return (
    <>
      <PageHeader title="Invitaciones pendientes" />
      <DataTable columns={cols} data={rows} keyExtractor={(i) => i.id} />
    </>
  );
}
```

- [ ] **Step 2: EstablishmentsPage** — list+create establishments and assign users

```tsx
import { useEffect, useState } from 'react';
import { Button, Input, PageHeader, DataTable, ColumnDef, Modal } from '../../components/ui';

interface Est { id: string; name: string; comuna: string; }

export default function EstablishmentsPage() {
  const [rows, setRows] = useState<Est[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [comuna, setComuna] = useState('');

  const reload = async () => {
    const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/org/establishments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('curaciones_access_token')}` },
    });
    setRows(await r.json());
  };
  useEffect(() => { reload(); }, []);

  const cols: ColumnDef<Est>[] = [
    { header: 'Nombre', key: 'name', cell: (e) => e.name },
    { header: 'Comuna', key: 'comuna', cell: (e) => e.comuna },
  ];

  return (
    <>
      <PageHeader title="Establecimientos" actions={<Button onClick={() => setOpen(true)}>Agregar</Button>} />
      <DataTable columns={cols} data={rows} keyExtractor={(e) => e.id} />
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo establecimiento">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} />
        <Button
          onClick={async () => {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/org/establishments`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${localStorage.getItem('curaciones_access_token')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ name, comuna }),
            });
            setOpen(false);
            setName(''); setComuna('');
            reload();
          }}
        >
          Crear
        </Button>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: SettingsPage** — edit org name, RUT, settings

```tsx
import { useEffect, useState } from 'react';
import { Button, Input, PageHeader, Card } from '../../components/ui';

export default function OrgSettingsPage() {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');

  useEffect(() => {
    const a = localStorage.getItem('curaciones_access_token');
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/org/settings`, {
      headers: { Authorization: `Bearer ${a}` },
    }).then((r) => r.json()).then((d) => { setName(d.name); setRut(d.rut ?? ''); });
  }, []);

  return (
    <>
      <PageHeader title="Información de la organización" />
      <Card>
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="RUT" value={rut} onChange={(e) => setRut(e.target.value)} />
        <Button
          onClick={async () => {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/org/settings`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${localStorage.getItem('curaciones_access_token')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ name, rut }),
            });
          }}
        >
          Guardar
        </Button>
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/org/
git commit -m "feat(frontend): add Mi Organización pages (invitations, establishments, settings)"
```

### Task 10.12: Register routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports + routes**

Imports:

```tsx
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SessionsPage from './pages/account/SessionsPage';
import ChangePasswordPage from './pages/account/ChangePasswordPage';
import MembersPage from './pages/org/MembersPage';
import InvitationsPage from './pages/org/InvitationsPage';
import EstablishmentsPage from './pages/org/EstablishmentsPage';
import OrgSettingsPage from './pages/org/SettingsPage';
```

Routes (inside the `<Routes>` block, before the catch-all `*`):

```tsx
<Route path="/accept-invitation" element={<AcceptInvitationPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
<Route path="/" element={<ProtectedRoute />}>
  <Route element={<Layout />}>
    {/* existing routes */}
    <Route path="account/sessions" element={<SessionsPage />} />
    <Route path="account/change-password" element={<ChangePasswordPage />} />
    <Route path="org/members" element={<MembersPage />} />
    <Route path="org/invitations" element={<InvitationsPage />} />
    <Route path="org/establishments" element={<EstablishmentsPage />} />
    <Route path="org/settings" element={<OrgSettingsPage />} />
  </Route>
</Route>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): register account/org and public auth routes"
```

**Phase 10 complete when:** all 12 frontend pieces compile; `npm run lint` and `npm run build` pass in `frontend/`.

---

## Phase 11 — Org isolation test suite

(Spec section 7.3 Suite 1.)

Each task creates one spec file with: 2 orgs, 2 users, listing isolation, fetch-by-id 404, update 404, delete 404. The shared helper to create orgs/users/auth:

### Task 11.1: Shared isolation helper

**Files:**
- Create: `backend/test/org-isolation/helpers.ts`

- [ ] **Step 1: Write**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

export async function createOrgWithUser(
  app: INestApplication,
  orgName: string,
  username: string,
  email: string,
): Promise<{ orgId: string; userId: number; accessToken: string; refreshToken: string }> {
  const ds = app.get(DataSource);
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [orgName],
  );
  const orgId = String(orgRes[0].id);
  const passwordHash = await bcrypt.hash('password123', 10);
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const userRes = await ds.query(
    `INSERT INTO "users"("username","passwordHash","email","emailHash","emailVerifiedAt","passwordChangedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [username, passwordHash, JSON.stringify({ plaintext: email }), emailHash],
  );
  const userId = userRes[0].id;
  await ds.query(
    `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
     VALUES ($1,$2,'owner','active',now())`,
    [userId, orgId],
  );
  await ds.query(
    `INSERT INTO "establishments"("name","comuna","organizationId") VALUES ($1,$2,$3)`,
    [`Sede ${orgName}`, 'Test', orgId],
  );
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ usernameOrEmail: username, password: 'password123' });
  return { orgId, userId, accessToken: login.body.accessToken, refreshToken: login.body.refreshToken };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/org-isolation/helpers.ts
git commit -m "test(org-isolation): add shared helper"
```

### Task 11.2: patient.spec.ts

**Files:**
- Create: `backend/test/org-isolation/patient.spec.ts`

- [ ] **Step 1: Write**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('Patient org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  it('user A cannot list patients of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');

    await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });

    const res = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .get(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .put(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ firstName: 'X' })
      .expect(404);
  });

  it('user A gets 404 deleting patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .delete(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run — expect FAIL initially (services not yet org-aware), implement scoping in patients service then PASS**

In `backend/src/patients/patients.service.ts`, replace any `repo.find()` with `findScoped(repo)`, any `repo.findOne({ where: { id }})` with `findOneScoped(repo, { where: { id }})`. Update all queries similarly.

```bash
cd backend && npx jest test/org-isolation/patient.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/test/org-isolation/patient.spec.ts backend/src/patients/
git commit -m "test(org-isolation): patient cross-tenant; scope service queries"
```

### Task 11.3 through 11.12: One spec per remaining tenanted entity

Repeat the structure of Task 11.2 for each entity. Each task: write spec, run (FAIL), fix the matching service to use `findScoped` / `findOneScoped`, run (PASS), commit.

- [ ] **Task 11.3** `curacion.spec.ts` — adapt for `/api/curaciones`
- [ ] **Task 11.4** `appointment.spec.ts` — `/api/appointments`
- [ ] **Task 11.5** `wound-photo.spec.ts` — `/api/wound-photos`
- [ ] **Task 11.6** `wound-note.spec.ts` — `/api/wound-notes`
- [ ] **Task 11.7** `consent-signature.spec.ts` — `/api/consent`
- [ ] **Task 11.8** `product.spec.ts` — `/api/inventory/products`
- [ ] **Task 11.9** `canasta-category.spec.ts` — `/api/inventory/canasta`
- [ ] **Task 11.10** `monthly-cycle.spec.ts` — `/api/cycles`
- [ ] **Task 11.11** `lot.spec.ts` — `/api/inventory/lots` (derived: filter by establishment.organizationId)
- [ ] **Task 11.12** `stock-count.spec.ts` — `/api/inventory/stock-counts` (derived)

For each, follow the same 4-test pattern (list, fetch 404, update 404, delete 404), adapting the request payloads to the entity. Commit after each.

**Phase 11 complete when:** 11 spec files green; every `services/*.service.ts` for tenanted entities uses `findScoped` / `findOneScoped`.

---

## Phase 12 — Production migration runbook + rollback test

(Spec section 7.1.)

### Task 12.1: Write runbook document

**Files:**
- Create: `docs/runbooks/2026-04-28-multi-tenancy-migration.md`

- [ ] **Step 1: Write**

```markdown
# Multi-Tenancy Migration Runbook

**Estimated window:** 30-60 min
**Rollback target:** `pre-migration-<timestamp>.dump`

## Pre-flight (T-30m)

1. Announce maintenance to user.
2. Confirm Resend API key in Railway env: `RESEND_API_KEY`, `EMAIL_FROM`.
3. Confirm AWS env: `KMS_CMK_ARN`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
4. Verify staging migration test green in CI.

## Step 1 — Stop traffic

```bash
railway service pause backend
```

## Step 2 — Fresh dump

```bash
pg_dump -Fc "$DATABASE_URL_PROD" > pre-migration-$(date +%Y%m%d-%H%M%S).dump
```

Confirm file size > 0 and listable:

```bash
pg_restore --list pre-migration-*.dump | head
```

## Step 3 — Run schema migration

```bash
DATABASE_URL=$DATABASE_URL_PROD npm --prefix backend run migration:run
```

Expected: `MultiTenancyFoundation1714400000000` applied successfully.

## Step 4 — Run encryption batch

```bash
DATABASE_URL=$DATABASE_URL_PROD KMS_BACKEND=aws npm --prefix backend run encryption:backfill
```

Expected: log lines `[enc] patients.rut: N processed`, etc.

## Step 5 — Verify audit chain

```bash
DATABASE_URL=$DATABASE_URL_PROD npm --prefix backend run audit:verify -- --org 1
```

Expected: `[audit:verify] OK — N rows verified for org 1`.

## Step 6 — Resume traffic

```bash
railway service resume backend
```

## Step 7 — Smoke test

- Login with owner email.
- Open patient list; open one patient (verify rut decrypts).
- Add a curación.
- Visit `/account/sessions` — current session listed.
- Visit `/audit-log` — recent rows present.

## Rollback (only if any of 4-7 fails)

```bash
railway service pause backend
pg_restore --clean --if-exists -d "$DATABASE_URL_PROD" pre-migration-*.dump
railway service resume backend
git push --force origin <previous-deploy-sha>:main   # only if you really must
```

Then restore frontend via the same revert.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/2026-04-28-multi-tenancy-migration.md
git commit -m "docs(runbook): multi-tenancy production migration"
```

### Task 12.2: Restore staging from prod dump

- [ ] **Step 1: Pull a prod dump**

```bash
pg_dump -Fc "$DATABASE_URL_PROD" > /tmp/prod-staging-test.dump
```

- [ ] **Step 2: Restore into staging**

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL_STAGING" /tmp/prod-staging-test.dump
```

- [ ] **Step 3: Validate restore**

```bash
psql "$DATABASE_URL_STAGING" -c "SELECT count(*) FROM patients;"
```

Expected: count matches prod row count.

### Task 12.3: Apply migration in staging

- [ ] **Step 1: Run migration**

```bash
DATABASE_URL=$DATABASE_URL_STAGING npm --prefix backend run migration:run
```

- [ ] **Step 2: Run encryption backfill**

```bash
DATABASE_URL=$DATABASE_URL_STAGING KMS_BACKEND=memory npm --prefix backend run encryption:backfill
```

(`memory` is acceptable in staging for the rollback drill.)

- [ ] **Step 3: Run audit verify**

```bash
DATABASE_URL=$DATABASE_URL_STAGING npm --prefix backend run audit:verify -- --org 1
```

Expected: OK.

### Task 12.4: Smoke test staging

- [ ] **Step 1: Deploy frontend pointing at staging API**

```bash
VITE_API_URL=https://api-staging.<placeholder>/api npm --prefix frontend run build
```

- [ ] **Step 2: Manually login, fetch patient, add curación, view sessions**

Document each as a checklist item. Capture screenshots for evidence.

### Task 12.5: Rollback drill

- [ ] **Step 1: Pause staging**

```bash
railway service pause backend-staging
```

- [ ] **Step 2: Restore the dump**

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL_STAGING" /tmp/prod-staging-test.dump
```

- [ ] **Step 3: Confirm schema reverted (no `organizationId` columns)**

```bash
psql "$DATABASE_URL_STAGING" -c "\d patients" | grep -i organizationId || echo "OK: column absent"
```

Expected: `OK: column absent`.

- [ ] **Step 4: Resume staging**

```bash
railway service resume backend-staging
```

### Task 12.6: Final readiness commit

- [ ] **Step 1: Update runbook with any deltas discovered during drill**

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/2026-04-28-multi-tenancy-migration.md
git commit -m "docs(runbook): incorporate findings from staging dry run"
```

**Phase 12 complete when:** runbook document exists; staging dry-run executed end-to-end; rollback drill reverted schema cleanly; all evidence captured.

---

## Definition of Done (cross-check vs spec section 7.4)

- [ ] Migration corre limpio en CI con dump de prod restaurado (Phase 12 task 12.3 + CI gate)
- [ ] Suite Org isolation: 100% de entities tenanted con tests (Phase 11 — 11 spec files)
- [ ] Suite Auth lifecycle: 12 endpoints cubiertos (Phase 8 — 12 endpoint tasks)
- [ ] `audit-verify --org 1` corre limpio post-migration (Phase 9 task 9.2 + Phase 12 step 5)
- [ ] AWS KMS conectado, DEK cache funcional, rotación documentada (Phase 4 + runbook)
- [ ] Org #1 demo operacional, user actual logueable (Phase 3 backfill + Phase 12 smoke)
- [ ] Frontend muestra org switcher, sesiones, mi organización (Phase 10 tasks 10.3-10.12)
- [ ] CLI `admin:create-org` documentado en README (Phase 9 task 9.3)
- [ ] Pen-test interno básico: 3 users de 3 orgs (Phase 11 covers 2 orgs; extend to 3 in pen-test gate before merge)

