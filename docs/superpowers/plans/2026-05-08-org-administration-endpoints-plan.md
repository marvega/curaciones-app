# Org administration endpoints — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 9 missing `/api/org/*` endpoints so Sub #1's frontend administration pages work end-to-end.

**Architecture:** New `OrgModule` at `backend/src/org/`. One controller, one service, four DTOs. Reuses `InvitationsService.create()` (auth module) and `EstablishmentsService.list()` (establishments module). All endpoints guarded by `JwtAuthGuard + RolesGuard @Roles('admin','owner')`. Org context derives from `req.user.organizationId` (already populated by `JwtStrategy`).

**Tech stack:** NestJS 11, TypeORM 0.3, class-validator, Jest 30, supertest. Postgres 18. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-08-org-administration-endpoints-design.md`.

**Branch:** `feat/org-administration-endpoints` (already created off `main`, with the spec doc committed at `d9d2586`).

**Operating rules:**
- TDD always: RED → GREEN → commit per endpoint.
- Fail fast (`feedback_fail_fast.md`): throw at boundaries, no defensive try/catch, no fallbacks for impossible states.
- No push, no PR (`feedback_no_push_during_platform_dev.md`); commit locally only.
- No `--amend`, no `--force`, no `--no-verify`, no `Co-authored-by` trailers (CLAUDE.md global rules).
- Run `git branch --show-current` before each commit (`feedback_verify_branch_before_commit.md`).

---

## File structure

```
backend/src/org/
├── org.module.ts           # registers controller + service; imports AuthModule, EstablishmentsModule
├── org.controller.ts       # 9 routes; all guarded by JwtAuthGuard + RolesGuard
├── org.service.ts          # business logic (settings, member/role mgmt, invite-already-member check, establishment create)
├── org.service.spec.ts     # unit tests for non-trivial logic
└── dto/
    ├── invite-member.dto.ts
    ├── update-role.dto.ts
    ├── create-establishment.dto.ts
    └── update-settings.dto.ts

backend/test/
└── org-administration.e2e-spec.ts   # happy-path + auth coverage for each endpoint
```

Edits:
- `backend/src/app.module.ts` — add `OrgModule` to `imports[]`.

---

## Task 1: Module skeleton + GET `/api/org/settings`

**Goal:** Wire the empty module, prove the route is mapped, ship the simplest endpoint end-to-end.

**Files:**
- Create: `backend/src/org/org.module.ts`
- Create: `backend/src/org/org.controller.ts`
- Create: `backend/src/org/org.service.ts`
- Create: `backend/test/org-administration.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing e2e (settings GET happy path + 401)**

Create `backend/test/org-administration.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';

interface OrgFixture {
  orgId: string;
  ownerId: number;
  ownerToken: string;
  adminId: number;
  adminToken: string;
  clinicianId: number;
  clinicianToken: string;
}

async function mintAccess(
  jwt: JwtService,
  userId: number,
  username: string,
  orgId: string,
  role: 'owner' | 'admin' | 'clinician' | 'receptionist',
): Promise<string> {
  return jwt.signAsync(
    {
      sub: userId,
      username,
      organizationId: orgId,
      organizationName: 'OrgFixture',
      role,
      establishmentIds: [],
      passwordChangedAt: Date.now(),
      jti: uuid(),
    },
    { expiresIn: '15m' },
  );
}

async function seedOrgFixture(app: INestApplication): Promise<OrgFixture> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);
  const tag = randomBytes(4).toString('hex');

  const [org] = await ds.query(
    `INSERT INTO "organizations"("name","rut") VALUES ($1,$2) RETURNING id`,
    [`Org ${tag}`, '76.123.456-7'],
  );
  const orgId = String(org.id);
  const passwordHash = await bcrypt.hash('password123', 10);

  const insertUser = async (username: string) => {
    const [u] = await ds.query(
      `INSERT INTO "users"("username","passwordHash","emailHash","emailVerifiedAt","passwordChangedAt")
       VALUES ($1,$2,$3,now(),now()) RETURNING id`,
      [username, passwordHash, createHash('sha256').update(`${username}@test.cl`).digest('hex')],
    );
    return u.id as number;
  };

  const ownerId = await insertUser(`owner_${tag}`);
  const adminId = await insertUser(`admin_${tag}`);
  const clinicianId = await insertUser(`clin_${tag}`);

  for (const [uid, role] of [
    [ownerId, 'owner'],
    [adminId, 'admin'],
    [clinicianId, 'clinician'],
  ] as const) {
    await ds.query(
      `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
       VALUES ($1,$2,$3,'active',now())`,
      [uid, orgId, role],
    );
  }

  return {
    orgId,
    ownerId,
    ownerToken: await mintAccess(jwt, ownerId, `owner_${tag}`, orgId, 'owner'),
    adminId,
    adminToken: await mintAccess(jwt, adminId, `admin_${tag}`, orgId, 'admin'),
    clinicianId,
    clinicianToken: await mintAccess(jwt, clinicianId, `clin_${tag}`, orgId, 'clinician'),
  };
}

describe('Org administration (e2e)', () => {
  let app: INestApplication;
  let fx: OrgFixture;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    fx = await seedOrgFixture(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/org/settings', () => {
    it('returns name and rut for the caller’s org (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(res.body).toEqual({ name: expect.stringMatching(/^Org /), rut: '76.123.456-7' });
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/org/settings').expect(401);
    });
  });
});
```

- [ ] **Step 2: Run the e2e to verify it fails**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: FAIL — `Cannot GET /api/org/settings` (404), because `OrgModule` doesn't exist yet.

- [ ] **Step 3: Create the empty service**

`backend/src/org/org.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async getSettings(organizationId: string): Promise<{ name: string; rut: string | null }> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return { name: org.name, rut: org.rut };
  }
}
```

- [ ] **Step 4: Create the controller with GET settings + guards**

`backend/src/org/org.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrgService } from './org.service';

@ApiTags('Org')
@ApiBearerAuth()
@Controller('api/org')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: { organizationId: string }) {
    return this.org.getSettings(user.organizationId);
  }
}
```

- [ ] **Step 5: Create the module**

`backend/src/org/org.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../organizations/organization.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Invitation } from '../auth/invitation.entity';
import { User } from '../users/user.entity';
import { Establishment } from '../establishments/establishment.entity';
import { AuthModule } from '../auth/auth.module';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMembership,
      Invitation,
      User,
      Establishment,
    ]),
    AuthModule,
    EstablishmentsModule,
  ],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
```

- [ ] **Step 6: Register OrgModule in app.module.ts**

Open `backend/src/app.module.ts`, find the `imports:` array, and add `OrgModule` after `AuthModule`:

```typescript
import { OrgModule } from './org/org.module';

// ... inside @Module({ imports: [ ... ] })
//     AuthModule,
      OrgModule,
//     UsersModule,
```

- [ ] **Step 7: Run the e2e to verify GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: PASS — both `returns name and rut` and `rejects without a JWT`.

- [ ] **Step 8: Commit**

```
cd /Users/marcelo/dev/claude/curaciones
git branch --show-current   # must be: feat/org-administration-endpoints
git add backend/src/org backend/src/app.module.ts backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): module skeleton + GET /api/org/settings"
```

---

## Task 2: PATCH `/api/org/settings`

**Goal:** Owners/admins can update name and RUT. Validation via DTO. Forbidden for clinicians.

**Files:**
- Create: `backend/src/org/dto/update-settings.dto.ts`
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`
- Create: `backend/src/org/org.service.spec.ts` (first time)

- [ ] **Step 1: Add e2e cases for PATCH settings**

Add this `describe` block inside the existing test file, after the GET block:

```typescript
describe('PATCH /api/org/settings', () => {
  it('updates name and rut', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/org/settings')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ name: 'New Name', rut: '99.999.999-9' })
      .expect(200);
    expect(res.body).toEqual({ name: 'New Name', rut: '99.999.999-9' });

    const verify = await request(app.getHttpServer())
      .get('/api/org/settings')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(verify.body).toEqual({ name: 'New Name', rut: '99.999.999-9' });
  });

  it('rejects clinician role with 403', async () => {
    await request(app.getHttpServer())
      .patch('/api/org/settings')
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .send({ name: 'Whatever' })
      .expect(403);
  });

  it('rejects empty name with 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/org/settings')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ name: '' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run e2e to confirm RED**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: 3 new failures (404 on PATCH because route doesn’t exist).

- [ ] **Step 3: Add the unit spec for `updateSettings`**

Create `backend/src/org/org.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';

describe('OrgService', () => {
  let service: OrgService;
  const orgRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(OrgService);
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('persists name and rut', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: null });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New', rut: '11.111.111-1' });
      expect(result).toEqual({ name: 'New', rut: '11.111.111-1' });
      expect(orgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'New', rut: '11.111.111-1' }));
    });
  });
});
```

- [ ] **Step 4: Create the DTO**

`backend/src/org/dto/update-settings.dto.ts`:

```typescript
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string;
}
```

- [ ] **Step 5: Add `updateSettings` to the service**

In `backend/src/org/org.service.ts`, append:

```typescript
import { UpdateSettingsDto } from './dto/update-settings.dto';

// inside class OrgService
async updateSettings(
  organizationId: string,
  dto: UpdateSettingsDto,
): Promise<{ name: string; rut: string | null }> {
  const org = await this.orgRepo.findOne({ where: { id: organizationId } });
  if (!org) throw new NotFoundException('Organization not found');
  org.name = dto.name;
  org.rut = dto.rut ?? null;
  const saved = await this.orgRepo.save(org);
  return { name: saved.name, rut: saved.rut };
}
```

- [ ] **Step 6: Add the route to the controller**

In `backend/src/org/org.controller.ts`, add the import and method:

```typescript
import { Body, Patch } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto';

// inside class OrgController
@Patch('settings')
updateSettings(
  @CurrentUser() user: { organizationId: string },
  @Body() dto: UpdateSettingsDto,
) {
  return this.org.updateSettings(user.organizationId, dto);
}
```

- [ ] **Step 7: Run unit + e2e**

```
cd backend
npm test -- --testPathPattern=org.service
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): PATCH /api/org/settings with role/name/rut validation"
```

---

## Task 3: GET `/api/org/members`

**Goal:** List all active memberships of the caller’s org. Each row needs `userId`, `username`, `email`, `role`, `status`.

**Files:**
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add e2e cases**

Append a new `describe` block:

```typescript
describe('GET /api/org/members', () => {
  it('returns active members of the org with username and role', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/org/members')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(res.body).toHaveLength(3);
    const usernames = res.body.map((m: { username: string }) => m.username).sort();
    expect(usernames[0]).toMatch(/^admin_/);
    expect(usernames[1]).toMatch(/^clin_/);
    expect(usernames[2]).toMatch(/^owner_/);
    for (const m of res.body) {
      expect(m).toEqual(
        expect.objectContaining({
          userId: expect.any(Number),
          role: expect.stringMatching(/^(owner|admin|clinician|receptionist)$/),
          status: 'active',
        }),
      );
    }
  });

  it('rejects clinician with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/org/members')
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .expect(403);
  });

  it('rejects without a JWT', async () => {
    await request(app.getHttpServer()).get('/api/org/members').expect(401);
  });
});
```

- [ ] **Step 2: Run e2e to confirm RED**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: 3 new failures (404 on the new endpoint).

- [ ] **Step 3: Extend service with `listMembers`**

In `backend/src/org/org.service.ts`, add the imports and method. Note the additional repos and the `KMS_SERVICE` injection go in the constructor — update its signature. Import `KMS_SERVICE` from `../kms/kms.service`; `KmsModule` is `@Global()` so no module changes are required.

Also add a reusable `Member` type alias above the `@Injectable()` decorator so `updateRole` (Task 4) can return the same shape:

```typescript
import { Inject } from '@nestjs/common';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { KMS_SERVICE, type KmsService } from '../kms/kms.service';

export type Member = {
  userId: number;
  username: string;
  email: string | null;
  role: OrgRole;
  status: MembershipStatus;
};

constructor(
  @InjectRepository(Organization)
  private readonly orgRepo: Repository<Organization>,
  @InjectRepository(OrganizationMembership)
  private readonly memRepo: Repository<OrganizationMembership>,
  @InjectRepository(User)
  private readonly userRepo: Repository<User>,
  @Inject(KMS_SERVICE) private readonly kms: KmsService,
) {}

// new method
async listMembers(organizationId: string): Promise<Member[]> {
  const rows = await this.memRepo.find({
    where: { organizationId, status: MembershipStatus.ACTIVE },
    order: { id: 'ASC' },
  });
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const users = await this.userRepo.findBy({ id: In(userIds) });
  const byId = new Map(users.map((u) => [u.id, u]));
  return Promise.all(
    rows.map(async (r) => {
      const u = byId.get(r.userId);
      if (!u) throw new Error(`Membership ${r.id} references missing user ${r.userId}`);
      const email = u.email
        ? await this.kms.decrypt(u.email, `User.email:${u.id}`, organizationId)
        : null;
      return {
        userId: u.id,
        username: u.username,
        email,
        role: r.role,
        status: r.status,
      };
    }),
  );
}
```

Add `In` to the typeorm imports at the top of the file:

```typescript
import { In, Repository } from 'typeorm';
```

The `email` field on `User` is encrypted JSONB. The TypeORM column transformer is a passthrough (it cannot call KMS synchronously), so the in-memory shape after a DB read is the raw `EncryptedField` object — service-layer code is responsible for explicit `kms.decrypt(...)` calls. The AAD format mirrors `PatientsService`: `User.email:<userId>`. No try/catch — if decryption throws, the request fails (per fail-fast).

- [ ] **Step 4: Add the controller route**

```typescript
@Get('members')
listMembers(@CurrentUser() user: { organizationId: string }) {
  return this.org.listMembers(user.organizationId);
}
```

- [ ] **Step 5: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): GET /api/org/members"
```

---

## Task 4: PATCH `/api/org/members/:userId`

**Goal:** Owners/admins can change a member’s role to admin/clinician/receptionist. Cannot promote to `owner`. Cannot demote the last `owner`.

**Files:**
- Create: `backend/src/org/dto/update-role.dto.ts`
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/src/org/org.service.spec.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add unit spec for `updateRole`**

In `backend/src/org/org.service.spec.ts`, replace the `OrgService` test setup so the constructor receives the additional repos. Update the file:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';
import { OrganizationMembership, OrgRole, MembershipStatus } from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';

describe('OrgService', () => {
  let service: OrgService;
  const orgRepo = { findOne: jest.fn(), save: jest.fn() };
  const memRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), count: jest.fn() };
  const userRepo = { findBy: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = m.get(OrgService);
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('persists name and rut', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: null });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New', rut: '11.111.111-1' });
      expect(result).toEqual({ name: 'New', rut: '11.111.111-1' });
    });
  });

  describe('updateRole', () => {
    it('rejects demoting the last owner with 409', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1', userId: 9, organizationId: '1', role: OrgRole.OWNER, status: MembershipStatus.ACTIVE,
      });
      memRepo.count.mockResolvedValue(1); // last owner
      await expect(service.updateRole('1', 9, OrgRole.ADMIN)).rejects.toThrow(ConflictException);
      expect(memRepo.save).not.toHaveBeenCalled();
    });

    it('persists when another owner exists', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1', userId: 9, organizationId: '1', role: OrgRole.OWNER, status: MembershipStatus.ACTIVE,
      });
      memRepo.count.mockResolvedValue(2);
      memRepo.save.mockImplementation(async (m) => m);
      userRepo.findBy.mockResolvedValue([{ id: 9, username: 'x', email: null }]);
      await service.updateRole('1', 9, OrgRole.ADMIN);
      expect(memRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: OrgRole.ADMIN }));
    });

    it('throws NotFound when membership does not exist', async () => {
      memRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRole('1', 9, OrgRole.ADMIN)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run unit spec to confirm RED**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: 3 failures in `updateRole` (method doesn’t exist).

- [ ] **Step 3: Create the DTO**

`backend/src/org/dto/update-role.dto.ts`:

```typescript
import { IsEnum, NotEquals } from 'class-validator';
import { OrgRole } from '../../organizations/organization-membership.entity';

export class UpdateRoleDto {
  @IsEnum(OrgRole)
  @NotEquals(OrgRole.OWNER)
  role!: OrgRole;
}
```

- [ ] **Step 4: Implement `updateRole` in the service**

In `backend/src/org/org.service.ts`, add:

```typescript
import { ConflictException } from '@nestjs/common';
import { OrgRole } from '../organizations/organization-membership.entity';

async updateRole(organizationId: string, userId: number, role: OrgRole): Promise<Member> {
  const membership = await this.memRepo.findOne({
    where: { organizationId, userId, status: MembershipStatus.ACTIVE },
  });
  if (!membership) throw new NotFoundException('Member not found');
  if (membership.role === OrgRole.OWNER && role !== OrgRole.OWNER) {
    const owners = await this.memRepo.count({
      where: { organizationId, role: OrgRole.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (owners <= 1) throw new ConflictException('Cannot demote the last owner');
  }
  membership.role = role;
  await this.memRepo.save(membership);
  // Return the same shape as listMembers' rows (Member). Email must be
  // explicitly decrypted via KMS_SERVICE — the column transformer is a
  // passthrough, not an auto-decrypter.
  const [user] = await this.userRepo.findBy({ id: In([userId]) });
  const email = user.email
    ? await this.kms.decrypt(user.email, `User.email:${user.id}`, organizationId)
    : null;
  return {
    userId: user.id,
    username: user.username,
    email,
    role: membership.role,
    status: membership.status,
  };
}
```

- [ ] **Step 5: Run unit spec to confirm GREEN**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: all PASS.

- [ ] **Step 6: Add e2e cases**

```typescript
describe('PATCH /api/org/members/:userId', () => {
  it('demotes the admin to clinician', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/org/members/${fx.adminId}`)
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ role: 'clinician' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ userId: fx.adminId, role: 'clinician' }));
  });

  it('rejects role=owner with 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/org/members/${fx.adminId}`)
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ role: 'owner' })
      .expect(400);
  });

  it('refuses to demote the last owner with 409', async () => {
    await request(app.getHttpServer())
      .patch(`/api/org/members/${fx.ownerId}`)
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ role: 'admin' })
      .expect(409);
  });

  it('rejects clinician role with 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/org/members/${fx.adminId}`)
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .send({ role: 'clinician' })
      .expect(403);
  });
});
```

- [ ] **Step 7: Add the controller route**

```typescript
import { Param, ParseIntPipe } from '@nestjs/common';
import { UpdateRoleDto } from './dto/update-role.dto';

@Patch('members/:userId')
updateRole(
  @CurrentUser() user: { organizationId: string },
  @Param('userId', ParseIntPipe) userId: number,
  @Body() dto: UpdateRoleDto,
) {
  return this.org.updateRole(user.organizationId, userId, dto.role);
}
```

- [ ] **Step 8: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): PATCH /api/org/members/:userId with last-owner guard"
```

---

## Task 5: DELETE `/api/org/members/:userId`

**Goal:** Owners/admins can revoke a member (soft-delete: `status='revoked'`). Cannot revoke yourself. Cannot revoke the last owner.

**Files:**
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/src/org/org.service.spec.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add unit spec for `revokeMember`**

Inside the existing `describe('OrgService', ...)`, add:

```typescript
describe('revokeMember', () => {
  it('rejects revoking yourself with 409', async () => {
    await expect(service.revokeMember('1', 9, 9)).rejects.toThrow(ConflictException);
  });

  it('rejects revoking the last owner with 409', async () => {
    memRepo.findOne.mockResolvedValue({
      id: '1', userId: 9, organizationId: '1', role: OrgRole.OWNER, status: MembershipStatus.ACTIVE,
    });
    memRepo.count.mockResolvedValue(1);
    await expect(service.revokeMember('1', 9, 1)).rejects.toThrow(ConflictException);
  });

  it('marks active membership as revoked', async () => {
    memRepo.findOne.mockResolvedValue({
      id: '1', userId: 9, organizationId: '1', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE,
    });
    memRepo.save.mockImplementation(async (m) => m);
    await service.revokeMember('1', 9, 1);
    expect(memRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: MembershipStatus.REVOKED, revokedAt: expect.any(Date) }),
    );
  });
});
```

- [ ] **Step 2: Run unit spec to confirm RED**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: 3 failures (method doesn’t exist).

- [ ] **Step 3: Implement `revokeMember`**

In `backend/src/org/org.service.ts`:

```typescript
async revokeMember(
  organizationId: string,
  targetUserId: number,
  callerUserId: number,
): Promise<void> {
  if (targetUserId === callerUserId) {
    throw new ConflictException('Cannot revoke yourself');
  }
  const membership = await this.memRepo.findOne({
    where: { organizationId, userId: targetUserId, status: MembershipStatus.ACTIVE },
  });
  if (!membership) throw new NotFoundException('Member not found');
  if (membership.role === OrgRole.OWNER) {
    const owners = await this.memRepo.count({
      where: { organizationId, role: OrgRole.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (owners <= 1) throw new ConflictException('Cannot revoke the last owner');
  }
  membership.status = MembershipStatus.REVOKED;
  membership.revokedAt = new Date();
  await this.memRepo.save(membership);
}
```

- [ ] **Step 4: Run unit spec to confirm GREEN**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: all PASS.

- [ ] **Step 5: Add e2e cases**

```typescript
describe('DELETE /api/org/members/:userId', () => {
  it('revokes another active member with 204', async () => {
    await request(app.getHttpServer())
      .delete(`/api/org/members/${fx.adminId}`)
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/api/org/members')
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .expect(200);
    expect(list.body.find((m: { userId: number }) => m.userId === fx.adminId)).toBeUndefined();
  });

  it('rejects revoking yourself with 409', async () => {
    await request(app.getHttpServer())
      .delete(`/api/org/members/${fx.ownerId}`)
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .expect(409);
  });

  it('rejects revoking the last owner with 409', async () => {
    await request(app.getHttpServer())
      .delete(`/api/org/members/${fx.ownerId}`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(409);
  });

  it('rejects clinician role with 403', async () => {
    await request(app.getHttpServer())
      .delete(`/api/org/members/${fx.adminId}`)
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 6: Add the controller route**

```typescript
import { Delete, HttpCode, HttpStatus } from '@nestjs/common';

@Delete('members/:userId')
@HttpCode(HttpStatus.NO_CONTENT)
async revokeMember(
  @CurrentUser() user: { id: number; organizationId: string },
  @Param('userId', ParseIntPipe) userId: number,
) {
  await this.org.revokeMember(user.organizationId, userId, user.id);
}
```

- [ ] **Step 7: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): DELETE /api/org/members/:userId with self-revoke and last-owner guards"
```

---

## Task 6: GET `/api/org/invitations`

**Goal:** Return only pending invitations: `acceptedAt IS NULL AND cancelledAt IS NULL AND expiresAt > now()`.

**Files:**
- Modify: `backend/src/org/org.module.ts` (add `Invitation` to `forFeature` — already done in Task 1)
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add e2e cases (seed three invitations: pending, accepted, expired)**

```typescript
describe('GET /api/org/invitations', () => {
  it('returns only pending invitations', async () => {
    const ds = app.get(DataSource);
    const tokenHash = createHash('sha256').update('xxx').digest('hex');
    const futureExp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastExp = new Date(Date.now() - 1000);

    await ds.query(
      `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt")
       VALUES ($1,$2,'admin',$3,$4,$5)`,
      [fx.orgId, 'pending@test.cl', fx.ownerId, tokenHash + '1', futureExp],
    );
    await ds.query(
      `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt","acceptedAt")
       VALUES ($1,$2,'admin',$3,$4,$5,now())`,
      [fx.orgId, 'accepted@test.cl', fx.ownerId, tokenHash + '2', futureExp],
    );
    await ds.query(
      `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt")
       VALUES ($1,$2,'admin',$3,$4,$5)`,
      [fx.orgId, 'expired@test.cl', fx.ownerId, tokenHash + '3', pastExp],
    );

    const res = await request(app.getHttpServer())
      .get('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual(
      expect.objectContaining({
        email: 'pending@test.cl',
        role: 'admin',
        id: expect.any(String),
      }),
    );
  });

  it('rejects clinician with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 2: Run e2e to confirm RED**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: 2 failures (404 / wrong shape).

- [ ] **Step 3: Add `listInvitations` to the service**

In `backend/src/org/org.service.ts`, add the import and the constructor injection for `Invitation`, plus the method:

```typescript
import { Invitation } from '../auth/invitation.entity';
import { MoreThan } from 'typeorm';
import { IsNull } from 'typeorm';

constructor(
  @InjectRepository(Organization)
  private readonly orgRepo: Repository<Organization>,
  @InjectRepository(OrganizationMembership)
  private readonly memRepo: Repository<OrganizationMembership>,
  @InjectRepository(User)
  private readonly userRepo: Repository<User>,
  @InjectRepository(Invitation)
  private readonly invRepo: Repository<Invitation>,
) {}

async listInvitations(organizationId: string) {
  const rows = await this.invRepo.find({
    where: {
      organizationId,
      acceptedAt: IsNull(),
      cancelledAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    },
    order: { createdAt: 'DESC' },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Add the controller route**

```typescript
@Get('invitations')
listInvitations(@CurrentUser() user: { organizationId: string }) {
  return this.org.listInvitations(user.organizationId);
}
```

- [ ] **Step 5: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): GET /api/org/invitations (pending only)"
```

---

## Task 7: POST `/api/org/invitations`

**Goal:** Create an invitation by email + role. Reject if a user with that email is already an active member of the org. Delegates to `InvitationsService.create()` which sends the email and persists the row.

**Files:**
- Create: `backend/src/org/dto/invite-member.dto.ts`
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/src/org/org.service.spec.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add unit spec for `invite`**

In `org.service.spec.ts`, add a fake `InvitationsService` to the providers and a new describe block:

```typescript
import { InvitationsService } from '../auth/invitations.service';

// add to the providers array in beforeEach:
{ provide: InvitationsService, useValue: { create: jest.fn() } },

// new describe inside describe('OrgService', ...):
describe('invite', () => {
  it('rejects duplicate-member email with 409', async () => {
    userRepo.findOne = jest.fn().mockResolvedValue({ id: 5 }); // user with that emailHash exists
    memRepo.findOne.mockResolvedValue({
      id: '7', userId: 5, organizationId: '1', role: OrgRole.CLINICIAN, status: MembershipStatus.ACTIVE,
    });
    const inviter = { id: 1, username: 'admin', organizationId: '1' };
    await expect(
      service.invite('1', inviter, 'foo@test.cl', OrgRole.CLINICIAN),
    ).rejects.toThrow(ConflictException);
  });

  it('delegates to InvitationsService.create otherwise', async () => {
    const invSvc = (service as unknown as { invitations: InvitationsService }).invitations;
    userRepo.findOne = jest.fn().mockResolvedValue(null);
    (invSvc.create as jest.Mock).mockResolvedValue({ invitation: { id: '42' }, token: 't' });
    const inviter = { id: 1, username: 'admin', organizationId: '1' };
    const result = await service.invite('1', inviter, 'foo@test.cl', OrgRole.CLINICIAN);
    expect(invSvc.create).toHaveBeenCalledWith('1', 1, 'admin', 'foo@test.cl', OrgRole.CLINICIAN);
    expect(result).toEqual({ id: '42' });
  });
});
```

- [ ] **Step 2: Run unit spec to confirm RED**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: 2 failures (method doesn’t exist, providers missing).

- [ ] **Step 3: Create the DTO**

`backend/src/org/dto/invite-member.dto.ts`:

```typescript
import { IsEmail, IsEnum, NotEquals } from 'class-validator';
import { OrgRole } from '../../organizations/organization-membership.entity';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrgRole)
  @NotEquals(OrgRole.OWNER)
  role!: OrgRole;
}
```

- [ ] **Step 4: Implement `invite` in the service**

Add `InvitationsService` to constructor injection and the new method:

```typescript
import { InvitationsService } from '../auth/invitations.service';
import { createHash } from 'crypto';

constructor(
  @InjectRepository(Organization)
  private readonly orgRepo: Repository<Organization>,
  @InjectRepository(OrganizationMembership)
  private readonly memRepo: Repository<OrganizationMembership>,
  @InjectRepository(User)
  private readonly userRepo: Repository<User>,
  @InjectRepository(Invitation)
  private readonly invRepo: Repository<Invitation>,
  private readonly invitations: InvitationsService,
) {}

async invite(
  organizationId: string,
  inviter: { id: number; username: string },
  email: string,
  role: OrgRole,
): Promise<{ id: string }> {
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const existingUser = await this.userRepo.findOne({ where: { emailHash } });
  if (existingUser) {
    const existingMem = await this.memRepo.findOne({
      where: { organizationId, userId: existingUser.id, status: MembershipStatus.ACTIVE },
    });
    if (existingMem) throw new ConflictException('User is already a member');
  }
  const { invitation } = await this.invitations.create(
    organizationId,
    inviter.id,
    inviter.username,
    email,
    role,
  );
  return { id: invitation.id };
}
```

- [ ] **Step 5: Run unit spec to confirm GREEN**

```
cd backend
npm test -- --testPathPattern=org.service
```

Expected: all PASS.

- [ ] **Step 6: Add e2e cases**

```typescript
describe('POST /api/org/invitations', () => {
  it('creates an invitation and returns its id', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ email: 'newperson@test.cl', role: 'clinician' })
      .expect(201);
    expect(res.body).toEqual({ id: expect.any(String) });

    const list = await request(app.getHttpServer())
      .get('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(list.body).toContainEqual(
      expect.objectContaining({ email: 'newperson@test.cl', role: 'clinician' }),
    );
  });

  it('rejects when inviting an existing active member with 409', async () => {
    // set the admin's emailHash so the lookup finds them
    const ds = app.get(DataSource);
    await ds.query(
      `UPDATE "users" SET "emailHash"=$1 WHERE id=$2`,
      [createHash('sha256').update('dup@test.cl').digest('hex'), fx.adminId],
    );
    await request(app.getHttpServer())
      .post('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ email: 'dup@test.cl', role: 'clinician' })
      .expect(409);
  });

  it('rejects role=owner with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ email: 'someone@test.cl', role: 'owner' })
      .expect(400);
  });

  it('rejects invalid email with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/org/invitations')
      .set('Authorization', `Bearer ${fx.ownerToken}`)
      .send({ email: 'not-an-email', role: 'clinician' })
      .expect(400);
  });
});
```

- [ ] **Step 7: Add the controller route**

```typescript
import { Post } from '@nestjs/common';
import { InviteMemberDto } from './dto/invite-member.dto';

@Post('invitations')
invite(
  @CurrentUser() user: { id: number; username: string; organizationId: string },
  @Body() dto: InviteMemberDto,
) {
  return this.org.invite(user.organizationId, { id: user.id, username: user.username }, dto.email, dto.role);
}
```

- [ ] **Step 8: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS. (Note: `EMAIL_BACKEND=noop` is set in `test/jest-env.ts`, so no real email is sent.)

- [ ] **Step 9: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): POST /api/org/invitations with duplicate-member guard"
```

---

## Task 8: GET `/api/org/establishments`

**Goal:** Reuse `EstablishmentsService.list()` (already org-scoped) and surface `{ id, name, comuna }`.

**Files:**
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add e2e cases**

```typescript
describe('GET /api/org/establishments', () => {
  it('returns establishments for the org', async () => {
    const ds = app.get(DataSource);
    await ds.query(
      `INSERT INTO "establishments"("name","comuna","organizationId") VALUES ($1,$2,$3)`,
      ['CESFAM Test', 'Quilpué', fx.orgId],
    );
    const res = await request(app.getHttpServer())
      .get('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: 'CESFAM Test', comuna: 'Quilpué' }),
    );
  });

  it('rejects clinician with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 2: Run e2e to confirm RED**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: 2 failures.

- [ ] **Step 3: Inject `EstablishmentsService` into the controller**

In `org.controller.ts`:

```typescript
import { EstablishmentsService } from '../establishments/establishments.service';

constructor(
  private readonly org: OrgService,
  private readonly establishments: EstablishmentsService,
) {}

@Get('establishments')
listEstablishments() {
  return this.establishments.list();
}
```

`EstablishmentsService.list()` already returns rows scoped to the caller’s org via the `@OrgScoped()` interceptor on the entity (see `backend/src/establishments/establishment.entity.ts`). No org-id parameter needed.

- [ ] **Step 4: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): GET /api/org/establishments (reuses EstablishmentsService)"
```

---

## Task 9: POST `/api/org/establishments`

**Goal:** Owners/admins can create a new establishment in their org.

**Files:**
- Create: `backend/src/org/dto/create-establishment.dto.ts`
- Modify: `backend/src/org/org.service.ts`
- Modify: `backend/src/org/org.controller.ts`
- Modify: `backend/test/org-administration.e2e-spec.ts`

- [ ] **Step 1: Add e2e cases**

```typescript
describe('POST /api/org/establishments', () => {
  it('creates an establishment and returns it', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ name: 'New Site', comuna: 'Viña' })
      .expect(201);
    expect(res.body).toEqual(
      expect.objectContaining({ id: expect.any(Number), name: 'New Site', comuna: 'Viña' }),
    );

    const list = await request(app.getHttpServer())
      .get('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);
    expect(list.body).toContainEqual(
      expect.objectContaining({ name: 'New Site', comuna: 'Viña' }),
    );
  });

  it('rejects empty name with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .send({ name: '', comuna: 'X' })
      .expect(400);
  });

  it('rejects clinician with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/org/establishments')
      .set('Authorization', `Bearer ${fx.clinicianToken}`)
      .send({ name: 'Y', comuna: 'Z' })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run e2e to confirm RED**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: 3 failures.

- [ ] **Step 3: Create the DTO**

`backend/src/org/dto/create-establishment.dto.ts`:

```typescript
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateEstablishmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  comuna!: string;
}
```

- [ ] **Step 4: Add `createEstablishment` to the service**

```typescript
import { Establishment } from '../establishments/establishment.entity';

constructor(
  // ... existing
  @InjectRepository(Establishment)
  private readonly estRepo: Repository<Establishment>,
  private readonly invitations: InvitationsService,
) {}

async createEstablishment(
  organizationId: string,
  dto: { name: string; comuna: string },
): Promise<{ id: number; name: string; comuna: string }> {
  const row = this.estRepo.create({
    name: dto.name,
    comuna: dto.comuna,
    organizationId,
  });
  const saved = await this.estRepo.save(row);
  return { id: saved.id, name: saved.name, comuna: saved.comuna };
}
```

- [ ] **Step 5: Add the controller route**

```typescript
import { CreateEstablishmentDto } from './dto/create-establishment.dto';

@Post('establishments')
createEstablishment(
  @CurrentUser() user: { organizationId: string },
  @Body() dto: CreateEstablishmentDto,
) {
  return this.org.createEstablishment(user.organizationId, dto);
}
```

- [ ] **Step 6: Run e2e to confirm GREEN**

```
cd backend
npm run test:e2e -- --testPathPattern=org-administration
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```
git branch --show-current
git add backend/src/org backend/test/org-administration.e2e-spec.ts
git commit -m "feat(org): POST /api/org/establishments"
```

---

## Task 10: Manual smoke + drill rerun

**Goal:** Validate end-to-end against the drilled prd-data DB and the running frontend, in the prod-style pipeline (`npm run start:prod`). No new code; this is the verification gate before declaring done.

- [ ] **Step 1: Confirm full unit + e2e suites pass**

```
cd backend
npm run test
npm run test:e2e
```

Expected: PASS, no skipped/failing specs.

- [ ] **Step 2: Confirm lint passes**

```
cd backend
npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Reset the local `curaciones` DB to the drilled prd dump**

```
PGPASSWORD=curaciones psql -h localhost -p 5433 -U curaciones -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname='curaciones' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS curaciones;
CREATE DATABASE curaciones OWNER curaciones;
GRANT ALL PRIVILEGES ON DATABASE curaciones TO curaciones_user;
SQL
gunzip -c /Users/marcelo/curaciones-backups/curaciones-2026-05-08-002828.sql.gz \
  | PGPASSWORD=curaciones psql -h localhost -p 5433 -U curaciones -d curaciones \
  > /tmp/drill-restore.log 2>&1
echo "ERROR lines (4 GRANT/REVOKE benign): $(grep -c '^ERROR' /tmp/drill-restore.log)"
```

Expected: exit 0, 4 ERROR lines (the inocuous `role "postgres"` GRANTs).

- [ ] **Step 4: Boot the prod-style backend on :3000**

Kill any existing :3000 listener first.

```
lsof -ti :3000 | xargs -r kill
cd backend
( set -a && source .env && set +a && npm run start:prod ) > /tmp/org-smoke-startprod.log 2>&1 &
```

Wait ~10 s, then:

```
grep -c "Mapped {/api/org/" /tmp/org-smoke-startprod.log
```

Expected: 9 (one per endpoint).

```
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
```

Expected: 200.

- [ ] **Step 5: Smoke each endpoint with `admin` JWT**

Log in via the running frontend (http://localhost:5173) as `admin` (or via `POST /api/auth/login`) and verify in the browser:

- Sidebar → "Mi organización" → no error toast on initial load
- Members tab: list shows 3 rows; change role on one row; revoke another; both reload
- Invitations tab: shows empty list (no pending) — invite a fake email, returns to list
- Establishments tab: shows the existing 1 establishment; create a new one; appears in list
- Settings tab: shows org name + RUT; edit and save; reload shows the change

If any step fails, capture the failing request from the browser network tab and triage before continuing.

Note on `Member.email`: `email` is decrypted in the service via `KmsService`. In a drilled DB the local KMS key won't match prod's encrypted bytes, so decryption will throw — that's the expected fail-fast behavior, not a bug. Tests seed users with `email = null` to avoid this; one e2e test encrypts via the running `KMS_SERVICE` to round-trip the contract.

- [ ] **Step 6: Tear down the smoke instance**

```
lsof -ti :3000 | xargs -r kill
```

- [ ] **Step 7: Commit any incidental polish (optional)**

If the smoke surfaced a small fix (missing field in response, off-by-one in edge case), make it an additional commit:

```
git branch --show-current
git add <files>
git commit -m "fix(org): <concise description>"
```

---

## Plan self-review

- All 9 endpoints in the spec have a task. Task 1=settings GET, 2=settings PATCH, 3=members GET, 4=members PATCH, 5=members DELETE, 6=invitations GET, 7=invitations POST, 8=establishments GET, 9=establishments POST. ✓
- All edge cases in the spec covered: last-owner demotion (Task 4), self-revoke + last-owner revoke (Task 5), duplicate-member invite (Task 7), invalid role/email (Tasks 4, 7). ✓
- All four DTOs created with class-validator rules from the spec. ✓
- Unit tests cover non-trivial logic (last-owner, self-revoke, duplicate-member). E2E covers happy path + auth + one rule per endpoint. ✓
- Auth model `@Roles('admin','owner')` applied at controller level (single decorator covers all 9 routes). ✓
- All file paths are exact. ✓
- Method names are consistent across tasks: `getSettings`, `updateSettings`, `listMembers`, `updateRole`, `revokeMember`, `listInvitations`, `invite`, `listEstablishments` (controller-only delegate), `createEstablishment`. ✓
- Fail-fast applied: every service method throws `NotFound`/`Conflict`; no try/catch swallowing; `Member.email` decryption is allowed to throw rather than papered over. ✓
- No `Co-authored-by` trailers in any commit message. ✓
- No push/PR steps. ✓

## Definition of done (cumulative)

1. Tasks 1–9 each commit on `feat/org-administration-endpoints`.
2. Tasks 1–9 unit + e2e suites all pass; full `npm run test` and `npm run test:e2e` clean.
3. `npm run lint` clean in `backend/`.
4. Task 10 smoke complete with no unexpected failures.
5. Branch is local only (no push), ready for a future PR to `main`.
