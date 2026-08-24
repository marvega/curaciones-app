# Solidify the Base — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exhaustive testing (TDD), Swagger docs, rate limiting, audit logging, and automated backups to the Curaciones clinical app.

**Architecture:** Retrofit tests onto existing NestJS services/controllers using Jest mocks, add E2E tests with a dedicated PostgreSQL test database, frontend tests with Vitest+RTL+Playwright. New features (rate limiting, audit log) built with TDD. Swagger decorators on all existing controllers/DTOs.

**Tech Stack:** NestJS 11, Jest 30, Supertest 7, Vitest, React Testing Library, Playwright, @nestjs/swagger 11, @nestjs/throttler, TypeORM 0.3, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-20-solidify-base-design.md`

---

## File Structure

### New Files
```
# Backend testing infrastructure
backend/.env.test
backend/test/setup.ts
backend/test/factories.ts
backend/test/utils.ts

# Backend unit tests (retrofit)
backend/src/auth/auth.service.spec.ts
backend/src/users/users.service.spec.ts
backend/src/patients/patients.service.spec.ts
backend/src/curaciones/curaciones.service.spec.ts
backend/src/reports/reports.service.spec.ts
backend/src/cycles/cycles.service.spec.ts
backend/src/auth/roles.guard.spec.ts

# Backend E2E tests
backend/test/auth.e2e-spec.ts
backend/test/patients.e2e-spec.ts
backend/test/curaciones.e2e-spec.ts
backend/test/appointments.e2e-spec.ts
backend/test/reports.e2e-spec.ts
backend/test/cycles.e2e-spec.ts
backend/test/users.e2e-spec.ts

# Frontend testing
frontend/vitest.setup.ts
frontend/src/contexts/__tests__/AuthContext.test.tsx
frontend/src/pages/__tests__/LoginPage.test.tsx
frontend/src/pages/__tests__/PatientsListPage.test.tsx
frontend/playwright.config.ts
frontend/e2e/auth.spec.ts
frontend/e2e/patients.spec.ts

# CI
.github/workflows/ci.yml

# Swagger (no new files — decorators added to existing)

# Rate limiting (no new files — configured in existing app.module.ts)

# Audit log
backend/src/audit-log/audit-log.entity.ts
backend/src/audit-log/audit-log.module.ts
backend/src/audit-log/audit-log.service.ts
backend/src/audit-log/audit-log.controller.ts
backend/src/audit-log/audit-log.interceptor.ts
backend/src/audit-log/audit-log.service.spec.ts
backend/test/audit-log.e2e-spec.ts
frontend/src/pages/AuditLogPage.tsx

# Backups
scripts/backup-db.sh
scripts/.env.backup.example
scripts/com.curaciones.backup.plist
```

### Modified Files
```
backend/src/app.module.ts              # Fix synchronize, add ThrottlerModule, AuditLogModule
backend/src/main.ts                    # Add Swagger setup
backend/package.json                   # Add @nestjs/throttler
backend/test/jest-e2e.json             # Update config for test setup
backend/.gitignore                     # (create if not exists) Add .env.test
.gitignore                             # Add scripts/.env.backup

# Swagger decorators on all controllers:
backend/src/auth/auth.controller.ts
backend/src/patients/patients.controller.ts
backend/src/curaciones/curaciones.controller.ts
backend/src/appointments/appointments.controller.ts
backend/src/reports/reports.controller.ts
backend/src/cycles/cycles.controller.ts
backend/src/users/users.controller.ts
backend/src/health.controller.ts

# Swagger decorators on all DTOs:
backend/src/auth/dto/login.dto.ts
backend/src/patients/create-patient.dto.ts
backend/src/patients/update-patient.dto.ts
backend/src/curaciones/create-curacion.dto.ts
backend/src/curaciones/update-curacion.dto.ts
backend/src/appointments/create-appointment.dto.ts
backend/src/users/create-user.dto.ts
backend/src/cycles/cycle.dto.ts

# Frontend
frontend/package.json                  # Add vitest, RTL, playwright deps
frontend/vite.config.ts                # Add vitest config
frontend/src/App.tsx                   # Add /audit-log route
```

---

## Task 1: Backend Testing Infrastructure

**Files:**
- Modify: `backend/src/app.module.ts:26` (fix synchronize)
- Create: `backend/.env.test`
- Create: `backend/test/setup.ts`
- Create: `backend/test/factories.ts`
- Create: `backend/test/utils.ts`
- Modify: `backend/test/jest-e2e.json`

- [ ] **Step 1: Fix `synchronize: true` in production**

In `backend/src/app.module.ts`, change line 26:

```typescript
// Before:
synchronize: true,

// After:
synchronize: process.env.NODE_ENV !== 'production',
```

- [ ] **Step 2: Verify backend still starts in dev mode**

Run: `cd backend && npm run start:dev`
Expected: App starts normally, no TypeORM errors.
Kill the process after verification.

- [ ] **Step 3: Create `.env.test`**

Create `backend/.env.test`:
```
DATABASE_URL=postgresql://localhost:5432/curaciones_test
JWT_SECRET=test-secret-key
NODE_ENV=test
```

- [ ] **Step 4: Add `.env.test` to `.gitignore`**

The root `.gitignore` already has `.env` and `.env.local` and `.env.*.local`. Add a specific entry for test env:

Append to `.gitignore`:
```
# Test environment
backend/.env.test
```

- [ ] **Step 5: Install dotenv for test setup**

Run: `cd backend && npm install --save-dev dotenv`

- [ ] **Step 6: Create test database locally**

Run: `createdb curaciones_test`
Expected: Database created (or already exists).

- [ ] **Step 7: Create E2E test setup helper**

Create `backend/test/setup.ts`:
```typescript
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repo = dataSource.getRepository(entity.name);
    await repo.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }
}
```

- [ ] **Step 8: Create test factories**

Create `backend/test/factories.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../src/users/user.entity';
import { Patient } from '../src/patients/patient.entity';
import { Curacion, CuracionType } from '../src/curaciones/curacion.entity';
import { Appointment } from '../src/appointments/appointment.entity';
import { MonthlyCycle } from '../src/cycles/cycle.entity';

let counter = 0;
function nextId() {
  return ++counter;
}

export function resetCounter() {
  counter = 0;
}

export async function createUser(
  app: INestApplication,
  overrides: Partial<User> = {},
): Promise<User> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(User);
  const n = nextId();
  const hash = await bcrypt.hash('password123', 10);
  const user = repo.create({
    username: `testuser${n}`,
    passwordHash: hash,
    role: 'user',
    ...overrides,
  });
  return repo.save(user);
}

export async function createAdmin(
  app: INestApplication,
  overrides: Partial<User> = {},
): Promise<User> {
  return createUser(app, { role: 'admin', ...overrides });
}

export async function createPatient(
  app: INestApplication,
  overrides: Partial<Patient> = {},
): Promise<Patient> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Patient);
  const n = nextId();
  const patient = repo.create({
    rut: `${10000000 + n}-${n % 10}`,
    firstName: `Test${n}`,
    lastName: `Patient${n}`,
    birthDate: '1990-01-15',
    gender: 'Femenino',
    ...overrides,
  });
  return repo.save(patient);
}

export async function createCuracion(
  app: INestApplication,
  patientId: number,
  overrides: Partial<Curacion> = {},
): Promise<Curacion> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Curacion);
  const curacion = repo.create({
    patientId,
    type: CuracionType.AVANZADA,
    date: '2026-03-20',
    quantity: 1,
    ...overrides,
  });
  return repo.save(curacion);
}

export async function createAppointment(
  app: INestApplication,
  patientId: number,
  overrides: Partial<Appointment> = {},
): Promise<Appointment> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Appointment);
  const appointment = repo.create({
    patientId,
    date: '2026-04-01',
    time: '13:00',
    ...overrides,
  });
  return repo.save(appointment);
}

export async function createCycle(
  app: INestApplication,
  overrides: Partial<MonthlyCycle> = {},
): Promise<MonthlyCycle> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(MonthlyCycle);
  const cycle = repo.create({
    year: 2026,
    month: 3,
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    ...overrides,
  });
  return repo.save(cycle);
}
```

- [ ] **Step 9: Create test utilities**

Create `backend/test/utils.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createUser, createAdmin } from './factories';

export async function loginAsUser(app: INestApplication): Promise<string> {
  const user = await createUser(app, { username: 'e2euser' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'e2euser', password: 'password123' });
  return res.body.access_token;
}

export async function loginAsAdmin(app: INestApplication): Promise<string> {
  const admin = await createAdmin(app, { username: 'e2eadmin' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'e2eadmin', password: 'password123' });
  return res.body.access_token;
}
```

- [ ] **Step 10: Update `jest-e2e.json`**

Replace `backend/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^src/(.*)$": "<rootDir>/../src/$1"
  }
}
```

- [ ] **Step 11: Update ts-jest to support Jest 30**

ts-jest 29 does NOT support Jest 30. Update proactively:
Run: `cd backend && npm install ts-jest@next --save-dev`
Then verify: `cd backend && npx jest --version && npx jest --listTests`
Expected: No compatibility errors.

- [ ] **Step 12: Commit**

```bash
git add backend/src/app.module.ts backend/package.json backend/package-lock.json backend/test/setup.ts backend/test/factories.ts backend/test/utils.ts backend/test/jest-e2e.json .gitignore
git commit -m "feat: add backend testing infrastructure and fix synchronize in production"
```

---

## Task 2: Backend Unit Tests — Auth & Users Services

**Files:**
- Create: `backend/src/auth/auth.service.spec.ts`
- Create: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: Write AuthService tests**

Create `backend/src/auth/auth.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Partial<UsersService>;
  let jwtService: Partial<JwtService>;

  const mockUser = {
    id: 1,
    username: 'testuser',
    passwordHash: '',
    role: 'user',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('correctpassword', 10);

    usersService = {
      findByUsername: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('should return user without passwordHash when credentials are valid', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.validateUser('testuser', 'correctpassword');
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('username', 'testuser');
    });

    it('should return null when user not found', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(null);
      const result = await service.validateUser('nonexistent', 'password');
      expect(result).toBeNull();
    });

    it('should return null when password is incorrect', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.validateUser('testuser', 'wrongpassword');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access_token and user info on valid credentials', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.login('testuser', 'correctpassword');
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result.user).toEqual({
        id: 1,
        username: 'testuser',
        role: 'user',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        username: 'testuser',
        role: 'user',
      });
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      (usersService.findByUsername as jest.Mock).mockResolvedValue(null);
      await expect(service.login('bad', 'bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
```

- [ ] **Step 2: Run AuthService tests**

Run: `cd backend && npx jest src/auth/auth.service.spec.ts --verbose`
Expected: All tests PASS.

- [ ] **Step 3: Write UsersService tests**

Create `backend/src/users/users.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repo: Partial<Repository<User>>;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    passwordHash: 'hashed',
    role: 'user',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByUsername', () => {
    it('should return user when found', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.findByUsername('testuser');
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.findByUsername('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.findById(1);
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when not found', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create user with hashed password', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.create({ username: 'newuser', password: 'pass123' });
      expect(repo.save).toHaveBeenCalled();
      const savedArg = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedArg.username).toBe('newuser');
      expect(savedArg.passwordHash).toBeDefined();
      expect(savedArg.passwordHash).not.toBe('pass123');
    });

    it('should throw ConflictException when username exists', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(mockUser);
      await expect(
        service.create({ username: 'testuser', password: 'pass123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when non-admin tries to create', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create(
          { username: 'new', password: 'pass123' },
          { id: 2, role: 'user' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should default role to user', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await service.create({ username: 'newuser', password: 'pass123' });
      const savedArg = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedArg.role).toBe('user');
    });
  });

  describe('findAll', () => {
    it('should return users without passwordHash', async () => {
      (repo.find as jest.Mock).mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(repo.find).toHaveBeenCalledWith({
        order: { username: 'ASC' },
        select: ['id', 'username', 'role', 'createdAt'],
      });
    });
  });

  describe('seed', () => {
    it('should create default users when they dont exist', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.seed();
      expect(result.created).toBe(2);
    });

    it('should skip existing users', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.seed();
      expect(result.created).toBe(0);
    });
  });
});
```

- [ ] **Step 4: Run UsersService tests**

Run: `cd backend && npx jest src/users/users.service.spec.ts --verbose`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/auth.service.spec.ts backend/src/users/users.service.spec.ts
git commit -m "test: add unit tests for AuthService and UsersService"
```

---

## Task 3: Backend Unit Tests — Patients Service

**Files:**
- Create: `backend/src/patients/patients.service.spec.ts`

- [ ] **Step 1: Write PatientsService tests**

Create `backend/src/patients/patients.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { PatientsService } from './patients.service';
import { Patient } from './patient.entity';
import { PatientStatusChange, PatientStatus, PatientStatusChangeType } from './patient-status-change.entity';
import { AppointmentsService } from '../appointments/appointments.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let patientRepo: Partial<Repository<Patient>>;
  let statusChangeRepo: Partial<Repository<PatientStatusChange>>;
  let appointmentsService: Partial<AppointmentsService>;

  const mockPatient: Patient = {
    id: 1,
    rut: '11111111-1',
    firstName: 'Ana',
    lastName: 'González',
    birthDate: '1985-03-15',
    gender: 'Femenino',
    phone: '+56912345678',
    address: 'Av. Principal 123',
    status: PatientStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    curaciones: [],
    appointments: [],
    statusChanges: [],
  };

  // Mock queryRunner for transaction tests
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((entity, data) => data),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    patientRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
      remove: jest.fn(),
    };
    statusChangeRepo = {
      find: jest.fn(),
    };
    appointmentsService = {
      deleteFutureByPatient: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getRepositoryToken(Patient), useValue: patientRepo },
        { provide: getRepositoryToken(PatientStatusChange), useValue: statusChangeRepo },
        { provide: AppointmentsService, useValue: appointmentsService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  describe('findByRut', () => {
    it('should return patient with curaciones', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(mockPatient);
      const result = await service.findByRut('11111111-1');
      expect(result).toEqual(mockPatient);
      expect(patientRepo.findOne).toHaveBeenCalledWith({
        where: { rut: '11111111-1' },
        relations: ['curaciones'],
      });
    });
  });

  describe('findById', () => {
    it('should return patient when found', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(mockPatient);
      const result = await service.findById(1);
      expect(result).toEqual(mockPatient);
    });

    it('should throw NotFoundException when not found', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create patient with valid data', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(null);
      const dto = { rut: '99999999-9', firstName: 'Test', lastName: 'User', birthDate: '1990-01-01', gender: 'Masculino' };
      await service.create(dto);
      expect(patientRepo.create).toHaveBeenCalledWith(dto);
      expect(patientRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when RUT exists', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(mockPatient);
      await expect(
        service.create({ rut: '11111111-1', firstName: 'A', lastName: 'B', birthDate: '1990-01-01', gender: 'F' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update and return patient', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue({ ...mockPatient });
      (patientRepo.save as jest.Mock).mockImplementation((p) => Promise.resolve(p));
      const result = await service.update(1, { firstName: 'Updated' });
      expect(result.firstName).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should remove existing patient', async () => {
      (patientRepo.findOne as jest.Mock).mockResolvedValue(mockPatient);
      await service.remove(1);
      expect(patientRepo.remove).toHaveBeenCalledWith(mockPatient);
    });
  });

  describe('findPaginated', () => {
    it('should return paginated results', async () => {
      (patientRepo.findAndCount as jest.Mock).mockResolvedValue([[mockPatient], 1]);
      const result = await service.findPaginated(1, 20);
      expect(result).toEqual({
        data: [mockPatient],
        total: 1,
        page: 1,
        totalPages: 1,
      });
    });

    it('should calculate totalPages correctly', async () => {
      (patientRepo.findAndCount as jest.Mock).mockResolvedValue([[], 45]);
      const result = await service.findPaginated(1, 20);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('discharge', () => {
    it('should discharge active patient in transaction', async () => {
      const activePatient = { ...mockPatient, status: PatientStatus.ACTIVE };
      mockQueryRunner.manager.findOne.mockResolvedValue(activePatient);
      mockQueryRunner.manager.save.mockResolvedValue(activePatient);
      (patientRepo.findOne as jest.Mock).mockResolvedValue({
        ...activePatient,
        status: PatientStatus.DISCHARGED,
      });

      await service.discharge(1, 1, false);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should cancel future appointments when flag is true', async () => {
      const activePatient = { ...mockPatient, status: PatientStatus.ACTIVE };
      mockQueryRunner.manager.findOne.mockResolvedValue(activePatient);
      mockQueryRunner.manager.save.mockResolvedValue(activePatient);
      (patientRepo.findOne as jest.Mock).mockResolvedValue(activePatient);

      await service.discharge(1, 1, true);
      expect(appointmentsService.deleteFutureByPatient).toHaveBeenCalledWith(1, mockQueryRunner.manager);
    });

    it('should throw BadRequestException if already discharged', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockPatient,
        status: PatientStatus.DISCHARGED,
      });
      await expect(service.discharge(1, 1, false)).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('readmit', () => {
    it('should readmit discharged patient', async () => {
      const discharged = { ...mockPatient, status: PatientStatus.DISCHARGED };
      mockQueryRunner.manager.findOne.mockResolvedValue(discharged);
      mockQueryRunner.manager.save.mockResolvedValue(discharged);
      (patientRepo.findOne as jest.Mock).mockResolvedValue({
        ...discharged,
        status: PatientStatus.ACTIVE,
      });

      await service.readmit(1, 1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if already active', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockPatient);
      await expect(service.readmit(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatusHistory', () => {
    it('should return status changes ordered by date DESC', async () => {
      (statusChangeRepo.find as jest.Mock).mockResolvedValue([]);
      await service.getStatusHistory(1);
      expect(statusChangeRepo.find).toHaveBeenCalledWith({
        where: { patientId: 1 },
        relations: ['performedBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });
});
```

- [ ] **Step 2: Run PatientsService tests**

Run: `cd backend && npx jest src/patients/patients.service.spec.ts --verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/patients/patients.service.spec.ts
git commit -m "test: add unit tests for PatientsService"
```

---

## Task 4: Backend Unit Tests — Curaciones, Appointments, Reports, Cycles, Guards

**Files:**
- Create: `backend/src/curaciones/curaciones.service.spec.ts`
- Create: `backend/src/reports/reports.service.spec.ts`
- Create: `backend/src/cycles/cycles.service.spec.ts`
- Create: `backend/src/auth/roles.guard.spec.ts`
- Existing: `backend/src/appointments/appointments.service.spec.ts` (extend)
- Existing: `backend/src/common/schedule.util.spec.ts` (already complete)

- [ ] **Step 1: Write CuracionesService tests**

Create `backend/src/curaciones/curaciones.service.spec.ts` with tests for:
- `create` — creates curacion without appointment
- `create` — creates curacion with linked appointment (calls appointmentsService.createLinked)
- `findByPatient` — returns curaciones ordered by date DESC
- `findOneWithAppointment` — returns curacion with appointment relation
- `update` — updates type/quantity in transaction, creates CuracionEdit
- `update` — handles appointment creation when curacion had none
- `update` — handles appointment update when curacion already had one
- `update` — handles appointment removal when null/null passed
- `update` — throws NotFoundException for non-existent curacion
- `getEdits` — returns edit history ordered by createdAt DESC

Pattern: Same mock structure as PatientsService tests — mock repos, mock DataSource with queryRunner for transaction tests. Mock AppointmentsService for linked operations.

- [ ] **Step 2: Extend AppointmentsService tests**

Existing file `backend/src/appointments/appointments.service.spec.ts` has 6 tests. Add:
- `create` — creates standalone appointment with valid slot
- `create` — throws BadRequestException for past date
- `create` — throws BadRequestException for double-booked slot
- `remove` — removes existing appointment
- `remove` — throws NotFoundException for non-existent appointment
- `findByPatient` — returns sorted by date/time ASC
- `getAvailability` — returns slots with available flag
- `getAgenda` — returns agenda items with patient/curacion info
- `createLinked` — creates appointment linked to curacion
- `updateLinked` — updates date/time, validates slots

- [ ] **Step 3: Write ReportsService tests**

Create `backend/src/reports/reports.service.spec.ts` with tests for:
- `getMonthlyReport` — returns counts by type for configured cycle
- `getMonthlyReport` — falls back to calendar month when no cycle
- `getDetailedReport` — applies year+quarter filter
- `getDetailedReport` — applies gender filter
- `getDetailedReport` — applies age range filter
- `getDetailedReport` — groups avanzada+pie_diabetico together

Pattern: Mock curacion repo's `createQueryBuilder` chain. Mock CyclesService.getEffectiveDates.

- [ ] **Step 4: Write CyclesService tests**

Create `backend/src/cycles/cycles.service.spec.ts` with tests for:
- `getCyclesByYear` — returns cycles ordered by month
- `getCycle` — returns specific cycle
- `getEffectiveDates` — returns cycle dates when configured
- `getEffectiveDates` — falls back to calendar month
- `getEffectiveDates` — calculates correct last day of month
- `upsertCycle` — creates new cycle
- `upsertCycle` — updates existing cycle
- `bulkUpsert` — processes multiple cycles
- `generateYearCycles` — chains start dates from previous cycle's end date

- [ ] **Step 5: Write RolesGuard tests**

Create `backend/src/auth/roles.guard.spec.ts`:
```typescript
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user?: { role: string }): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: 'user' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ role: 'user' });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should deny access when no user in request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 6: Run all unit tests**

Run: `cd backend && npx jest --verbose`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/curaciones/curaciones.service.spec.ts backend/src/appointments/appointments.service.spec.ts backend/src/reports/reports.service.spec.ts backend/src/cycles/cycles.service.spec.ts backend/src/auth/roles.guard.spec.ts
git commit -m "test: add unit tests for remaining backend services and guards"
```

---

## Task 5: Backend E2E Tests — Auth, Health, Patients

**Files:**
- Modify: `backend/test/app.e2e-spec.ts` (replace with health test)
- Create: `backend/test/auth.e2e-spec.ts`
- Create: `backend/test/patients.e2e-spec.ts`

**Prerequisite:** Local `curaciones_test` database must exist. Load `.env.test` before running:
`cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand`

- [ ] **Step 1: Replace app.e2e-spec.ts with health test**

Replace `backend/test/app.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health should return ok', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});
```

- [ ] **Step 2: Write auth E2E tests**

Create `backend/test/auth.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { createUser } from './factories';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should return token for valid credentials', async () => {
      await createUser(app, { username: 'logintest' });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'logintest', password: 'password123' })
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body.user).toHaveProperty('username', 'logintest');
    });

    it('should return 401 for invalid password', async () => {
      await createUser(app, { username: 'logintest' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'logintest', password: 'wrong' })
        .expect(401);
    });

    it('should return 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'ghost', password: 'nope' })
        .expect(401);
    });
  });

  describe('Protected endpoints', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/patients')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      await createUser(app, { username: 'authuser' });
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'authuser', password: 'password123' });

      await request(app.getHttpServer())
        .get('/api/patients?page=1&limit=5')
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .expect(200);
    });
  });
});
```

- [ ] **Step 3: Write patients E2E tests**

Create `backend/test/patients.e2e-spec.ts` covering:
- `POST /api/patients` — create patient, returns 201
- `POST /api/patients` — duplicate RUT returns 409
- `GET /api/patients?page=1&limit=5` — paginated list
- `GET /api/patients?rut=...` — search by RUT
- `GET /api/patients/:id` — get single patient
- `GET /api/patients/:id` — not found returns 404
- `PUT /api/patients/:id` — update patient
- `DELETE /api/patients/:id` — delete patient
- `POST /api/patients/:id/discharge` — discharge active patient
- `POST /api/patients/:id/discharge` — already discharged returns 400
- `POST /api/patients/:id/readmit` — readmit discharged patient
- `GET /api/patients/:id/status-history` — returns status changes

All tests: authenticate first via `loginAsUser` or `loginAsAdmin` helper, cleanDatabase between tests.

- [ ] **Step 4: Run E2E tests**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand --verbose`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/test/app.e2e-spec.ts backend/test/auth.e2e-spec.ts backend/test/patients.e2e-spec.ts
git commit -m "test: add E2E tests for health, auth, and patients endpoints"
```

---

## Task 6: Backend E2E Tests — Curaciones, Appointments, Reports, Cycles, Users

**Files:**
- Create: `backend/test/curaciones.e2e-spec.ts`
- Create: `backend/test/appointments.e2e-spec.ts`
- Create: `backend/test/reports.e2e-spec.ts`
- Create: `backend/test/cycles.e2e-spec.ts`
- Create: `backend/test/users.e2e-spec.ts`

- [ ] **Step 1: Write curaciones E2E tests**

`backend/test/curaciones.e2e-spec.ts` covering:
- `POST /api/curaciones` — create without appointment
- `POST /api/curaciones` — create with linked appointment
- `GET /api/curaciones/patient/:patientId` — list by patient
- `GET /api/curaciones/agenda?from=&to=` — agenda range
- `GET /api/curaciones/availability?date=` — slot availability
- `PUT /api/curaciones/:id` — admin edit with reason (test admin-only access)
- `PUT /api/curaciones/:id` — user role returns 403
- `GET /api/curaciones/:id/edits` — edit audit trail

- [ ] **Step 2: Write appointments E2E tests**

`backend/test/appointments.e2e-spec.ts` covering:
- `POST /api/appointments` — create standalone
- `POST /api/appointments` — invalid slot returns 400
- `POST /api/appointments` — double-booking returns 400
- `DELETE /api/appointments/:id` — delete appointment
- `GET /api/appointments/patient/:patientId` — list by patient

- [ ] **Step 3: Write reports E2E tests**

`backend/test/reports.e2e-spec.ts` covering:
- `GET /api/reports/monthly?year=2026&month=3` — monthly report with seeded data
- `GET /api/reports/detailed?year=2026&quarter=1` — detailed report
- `GET /api/reports/detailed?gender=Femenino` — gender filter

- [ ] **Step 4: Write cycles E2E tests**

`backend/test/cycles.e2e-spec.ts` covering:
- `GET /api/cycles?year=2026` — list cycles
- `POST /api/cycles` — upsert cycle (admin)
- `POST /api/cycles/bulk` — bulk upsert (admin)
- `GET /api/cycles/effective?year=2026&month=3` — effective dates

- [ ] **Step 5: Write users E2E tests**

`backend/test/users.e2e-spec.ts` covering:
- `GET /api/users` — admin can list users
- `GET /api/users` — non-admin returns 403
- `POST /api/users` — admin creates user
- `POST /api/users` — duplicate username returns 409

- [ ] **Step 6: Run all E2E tests**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand --verbose`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/test/curaciones.e2e-spec.ts backend/test/appointments.e2e-spec.ts backend/test/reports.e2e-spec.ts backend/test/cycles.e2e-spec.ts backend/test/users.e2e-spec.ts
git commit -m "test: add E2E tests for curaciones, appointments, reports, cycles, and users"
```

---

## Task 7: Frontend Testing Setup

**Files:**
- Modify: `frontend/package.json` (add test deps)
- Modify: `frontend/vite.config.ts` (add vitest config)
- Create: `frontend/vitest.setup.ts`

- [ ] **Step 1: Install test dependencies**

Run:
```bash
cd frontend && npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Configure Vitest in vite.config.ts**

Update `frontend/vite.config.ts`:
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: false,
  },
})
```

- [ ] **Step 3: Create vitest setup file**

Create `frontend/vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to package.json**

Add to `frontend/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify setup with a smoke test**

Create `frontend/src/__tests__/smoke.test.ts`:
```typescript
describe('test setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd frontend && npm test`
Expected: PASS.

Delete `frontend/src/__tests__/smoke.test.ts` after verification.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/vitest.setup.ts
git commit -m "feat: configure Vitest and React Testing Library for frontend"
```

---

## Task 8: Frontend Unit Tests

**Files:**
- Create: `frontend/src/contexts/__tests__/AuthContext.test.tsx`
- Create: `frontend/src/pages/__tests__/LoginPage.test.tsx`
- Create: `frontend/src/pages/__tests__/PatientsListPage.test.tsx`

- [ ] **Step 1: Write AuthContext tests**

Test cases:
- Renders children when wrapped
- Provides default unauthenticated state
- login() stores token and user, sets isAuthenticated
- logout() clears state
- isAdmin returns true when user.role === 'admin'

Pattern: Render a test consumer component inside AuthProvider, interact via login/logout.

- [ ] **Step 2: Write LoginPage tests**

Test cases:
- Renders username and password fields
- Shows validation error on empty submit
- Calls login on valid submission
- Redirects to / on successful login
- Displays error message on failed login

Pattern: Mock AuthContext, mock react-router-dom navigate.

- [ ] **Step 3: Write PatientsListPage tests**

Test cases:
- Renders loading state initially
- Renders patient list after fetch
- Shows pagination controls
- Search by RUT input works

Pattern: Mock axios GET calls with patient data.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/__tests__/AuthContext.test.tsx frontend/src/pages/__tests__/LoginPage.test.tsx frontend/src/pages/__tests__/PatientsListPage.test.tsx
git commit -m "test: add frontend unit tests for AuthContext, LoginPage, and PatientsListPage"
```

---

## Task 9: Frontend E2E Tests with Playwright

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/auth.spec.ts`
- Create: `frontend/e2e/patients.spec.ts`

- [ ] **Step 1: Install Playwright**

Run:
```bash
cd frontend && npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

Create `frontend/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'cd ../backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npm run start:dev',
      port: 3000,
      reuseExistingServer: true,
    },
    {
      command: 'VITE_API_URL=http://localhost:3000/api npm run dev',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
```

- [ ] **Step 3: Write auth E2E flow**

Create `frontend/e2e/auth.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login and redirect to home', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', '<redactado: era una contraseña real, ver docs/runbooks/2026-08-24-credential-exposure.md>');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'bad');
    await page.fill('input[name="password"]', 'bad');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=incorrectos')).toBeVisible();
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });
});
```

- [ ] **Step 4: Write patients E2E flow**

Create `frontend/e2e/patients.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', '<redactado: era una contraseña real, ver docs/runbooks/2026-08-24-credential-exposure.md>');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should navigate to patients list', async ({ page }) => {
    await page.click('text=Pacientes');
    await expect(page).toHaveURL('/pacientes');
  });

  test('should create a new patient', async ({ page }) => {
    await page.goto('/paciente/nuevo');
    await page.fill('input[name="rut"]', '12345678-9');
    await page.fill('input[name="firstName"]', 'Playwright');
    await page.fill('input[name="lastName"]', 'Test');
    await page.fill('input[name="birthDate"]', '1990-01-01');
    await page.selectOption('select[name="gender"]', 'Masculino');
    await page.click('button[type="submit"]');
    // Should redirect to patient page or show success
    await expect(page.locator('text=Playwright')).toBeVisible();
  });
});
```

- [ ] **Step 5: Run Playwright tests**

Run: `cd frontend && npx playwright test --reporter=list`
Expected: All tests PASS (requires backend + frontend running with test DB).

- [ ] **Step 6: Add Playwright to .gitignore**

Append to `frontend/.gitignore`:
```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 7: Commit**

```bash
git add frontend/playwright.config.ts frontend/e2e/ frontend/.gitignore frontend/package.json frontend/package-lock.json
git commit -m "test: add Playwright E2E tests for auth and patient flows"
```

---

## Task 10: CI Pipeline — GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: curaciones_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/curaciones_test
      JWT_SECRET: ci-test-secret
      NODE_ENV: test
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - name: Run unit tests
        run: npx jest --verbose
      - name: Run E2E tests
        run: npx jest --config ./test/jest-e2e.json --runInBand --verbose

  frontend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - name: Run unit tests
        run: npm test
      - name: Install Playwright
        run: npx playwright install --with-deps chromium
      - name: Build frontend
        run: npm run build
        env:
          VITE_API_URL: http://localhost:3000/api
      # Note: Playwright E2E requires backend running.
      # For full E2E in CI, consider a combined job or skip in favor of local runs.
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for backend and frontend tests"
```

---

## Task 11: Swagger / OpenAPI Documentation

**Files:**
- Modify: `backend/src/main.ts`
- Modify: All controller files (add `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`)
- Modify: All DTO files (add `@ApiProperty`)

- [ ] **Step 1: Configure Swagger in main.ts**

`@nestjs/swagger` is already installed. Add to `backend/src/main.ts` after the ValidationPipe setup:
```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

// Inside bootstrap(), after app.useGlobalPipes():
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  const config = new DocumentBuilder()
    .setTitle('Curaciones API')
    .setDescription('API for clinical wound care management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  console.log('Swagger UI available at /api/docs');
}
```

- [ ] **Step 2: Verify Swagger UI loads**

Run: `cd backend && npm run start:dev`
Open: http://localhost:3000/api/docs
Expected: Swagger UI loads with all endpoints listed.

- [ ] **Step 3: Add `@ApiTags` and `@ApiOperation` to all controllers**

Add decorators to each controller:
- `AuthController` — `@ApiTags('Auth')`
- `PatientsController` — `@ApiTags('Patients')`
- `CuracionesController` — `@ApiTags('Curaciones')`
- `AppointmentsController` — `@ApiTags('Appointments')`
- `ReportsController` — `@ApiTags('Reports')`
- `CyclesController` — `@ApiTags('Cycles')`
- `UsersController` — `@ApiTags('Users')`
- `HealthController` — `@ApiTags('Health')`

Add `@ApiBearerAuth()` to all controllers except HealthController and AuthController.
Add `@ApiOperation({ summary: '...' })` to each endpoint.

- [ ] **Step 4: Add `@ApiProperty` to all DTOs**

Add `@ApiProperty()` with `example` values to:
- `LoginDto` — `{ example: 'admin' }`, `{ example: 'password123' }`
- `CreatePatientDto` — `{ example: '11111111-1' }`, etc.
- `UpdatePatientDto` — all optional properties
- `CreateCuracionDto` — with enum examples
- `UpdateCuracionDto` — with reason example
- `CreateAppointmentDto` — date/time examples
- `CreateUserDto` — username/password/role examples
- `UpsertCycleDto` — year/month/date examples

- [ ] **Step 5: Verify Swagger shows complete schemas**

Run: `cd backend && npm run start:dev`
Check http://localhost:3000/api/docs — all endpoints should show request/response schemas with examples.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main.ts backend/src/auth/ backend/src/patients/ backend/src/curaciones/ backend/src/appointments/ backend/src/reports/ backend/src/cycles/ backend/src/users/ backend/src/health.controller.ts
git commit -m "feat: add Swagger/OpenAPI documentation to all endpoints and DTOs"
```

---

## Task 12: Rate Limiting

**Files:**
- Modify: `backend/package.json` (add @nestjs/throttler)
- Modify: `backend/src/app.module.ts` (add ThrottlerModule)
- Modify: `backend/src/auth/auth.controller.ts` (stricter limit)
- Modify: `backend/src/health.controller.ts` (skip throttle)

- [ ] **Step 1: Write failing test for rate limiting**

Add to `backend/test/auth.e2e-spec.ts`:
```typescript
it('should return 429 after too many login attempts', async () => {
  for (let i = 0; i < 5; i++) {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'bad', password: 'bad' });
  }
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'bad', password: 'bad' });
  expect(res.status).toBe(429);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json auth.e2e-spec --runInBand`
Expected: FAIL (429 not returned, gets 401 instead).

- [ ] **Step 3: Install @nestjs/throttler**

Run: `cd backend && npm install @nestjs/throttler`

- [ ] **Step 4: Configure ThrottlerModule in AppModule**

Add to `backend/src/app.module.ts`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// In imports array:
ThrottlerModule.forRoot({
  throttlers: process.env.NODE_ENV === 'test'
    ? [{ name: 'default', ttl: 60000, limit: 10000 }, { name: 'login', ttl: 60000, limit: 10000 }]
    : [{ name: 'default', ttl: 60000, limit: 100 }, { name: 'login', ttl: 60000, limit: 5 }],
}),

// In providers array:
{ provide: APP_GUARD, useClass: ThrottlerGuard },
```

- [ ] **Step 5: Apply stricter limit to login endpoint**

In `backend/src/auth/auth.controller.ts`:
```typescript
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Throttle({ login: { ttl: 60000, limit: 5 } })
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

- [ ] **Step 6: Skip throttle on health endpoint**

In `backend/src/health.controller.ts`:
```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('api/health')
export class HealthController { ... }
```

- [ ] **Step 7: Disable throttler in test environment, use override for rate limit test**

The default `NODE_ENV=test` disables strict throttling so other E2E tests don't get spurious 429s. The rate limit E2E test creates its own test app with strict limits.

The ThrottlerModule config in `app.module.ts` (from Step 4) already uses high limits for `NODE_ENV=test`.

For the rate limit test, create a dedicated test that overrides the module:
```typescript
// In backend/test/auth.e2e-spec.ts, add a separate describe block:
describe('Rate Limiting (e2e)', () => {
  let rateLimitApp: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('THROTTLER_OPTIONS')
      .useValue([{ name: 'login', ttl: 60000, limit: 5 }])
      .compile();

    rateLimitApp = moduleFixture.createNestApplication();
    rateLimitApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await rateLimitApp.init();
  });

  afterAll(async () => {
    await rateLimitApp.close();
  });

  it('should return 429 after too many login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(rateLimitApp.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'bad', password: 'bad' });
    }
    const res = await request(rateLimitApp.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'bad', password: 'bad' });
    expect(res.status).toBe(429);
  });
});
```

Note: If the override approach doesn't work cleanly with ThrottlerModule, an alternative is to set `NODE_ENV=test-ratelimit` for this specific test and add a third condition in the ThrottlerModule config. The implementer should verify which approach works and adjust.

- [ ] **Step 8: Run rate limit test**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json auth.e2e-spec --runInBand`
Expected: PASS (429 returned on 6th login attempt).

- [ ] **Step 9: Run all tests to ensure nothing broke**

Run: `cd backend && npx jest --verbose && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand`
Expected: All PASS. If other E2E tests hit rate limits, add delays or increase test limits.

- [ ] **Step 10: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/app.module.ts backend/src/auth/auth.controller.ts backend/src/health.controller.ts backend/test/auth.e2e-spec.ts
git commit -m "feat: add rate limiting with @nestjs/throttler (5/min login, 100/min general)"
```

---

## Task 13: Audit Log — Entity, Module, Interceptor

**Files:**
- Create: `backend/src/audit-log/audit-log.entity.ts`
- Create: `backend/src/audit-log/audit-log.module.ts`
- Create: `backend/src/audit-log/audit-log.service.ts`
- Create: `backend/src/audit-log/audit-log.service.spec.ts`
- Create: `backend/src/audit-log/audit-log.interceptor.ts`
- Modify: `backend/src/app.module.ts` (add entity + module)

- [ ] **Step 1: Write failing test for AuditLogService**

Create `backend/src/audit-log/audit-log.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditAction } from './audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: Partial<Repository<AuditLog>>;

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      await service.log({
        userId: 1,
        username: 'admin',
        action: AuditAction.CREATE,
        entity: 'Patient',
        entityId: 42,
        payload: { firstName: 'Test' },
      });
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });

    it('should filter by entity', async () => {
      await service.findAll({ page: 1, limit: 20, entity: 'Patient' });
      expect(repo.findAndCount).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/audit-log/audit-log.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create AuditLog entity**

Create `backend/src/audit-log/audit-log.entity.ts`:
```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

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
  payload: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}
```

- [ ] **Step 4: Create AuditLogService**

Create `backend/src/audit-log/audit-log.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';

interface LogEntry {
  userId: number;
  username: string;
  action: AuditAction;
  entity: string;
  entityId: number;
  payload?: Record<string, any>;
  ipAddress?: string;
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
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(entry: LogEntry): Promise<AuditLog> {
    const log = this.auditLogRepo.create(entry);
    return this.auditLogRepo.save(log);
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

- [ ] **Step 5: Create AuditLogInterceptor**

Create `backend/src/audit-log/audit-log.interceptor.ts`:
```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';

const SKIP_PATHS = [
  '/api/auth/login',
  '/api/health',
  '/api/users/seed',
  '/api/patients/seed',
];

// Paths with their own audit trail: [pattern, method]
const CUSTOM_AUDIT_PATHS: Array<{ pattern: RegExp; method: string }> = [
  { pattern: /^\/api\/curaciones\/\d+$/, method: 'PUT' },       // CuracionEdit
  { pattern: /^\/api\/patients\/\d+\/discharge$/, method: 'POST' },  // PatientStatusChange
  { pattern: /^\/api\/patients\/\d+\/readmit$/, method: 'POST' },    // PatientStatusChange
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, body, user, ip } = request;

    // Only audit write operations
    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Skip paths that don't need auditing
    if (SKIP_PATHS.includes(path)) {
      return next.handle();
    }

    // Skip paths that have their own audit trail
    if (CUSTOM_AUDIT_PATHS.some((entry) => entry.pattern.test(path) && method === entry.method)) {
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

    // Extract entity name and ID from path
    const pathParts = path.replace('/api/', '').split('/');
    const entity = pathParts[0];
    const entityId = parseInt(pathParts[1], 10) || 0;

    return next.handle().pipe(
      tap((responseBody) => {
        const logEntityId = entityId || responseBody?.id || 0;
        this.auditLogService.log({
          userId: user.id || user.sub,
          username: user.username,
          action,
          entity,
          entityId: logEntityId,
          payload: method !== 'DELETE' ? body : undefined,
          ipAddress: ip,
        }).catch(() => {
          // Audit log failure should not break the request
        });
      }),
    );
  }
}
```

- [ ] **Step 6: Create AuditLogModule**

Create `backend/src/audit-log/audit-log.module.ts` (without controller — added in Task 14):
```typescript
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService, AuditLogInterceptor],
  exports: [AuditLogService, AuditLogInterceptor],
})
export class AuditLogModule {}
```

- [ ] **Step 7: Register in AppModule**

In `backend/src/app.module.ts`:
- Add `AuditLog` to entities array
- Add `AuditLogModule` to imports array
- Add `APP_INTERCEPTOR` provider for `AuditLogInterceptor`:
```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';

// In providers:
{ provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
```

- [ ] **Step 8: Run unit test**

Run: `cd backend && npx jest src/audit-log/audit-log.service.spec.ts --verbose`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/audit-log/ backend/src/app.module.ts
git commit -m "feat: add AuditLog entity, service, and interceptor"
```

---

## Task 14: Audit Log — Controller, E2E Tests, Frontend Page

**Files:**
- Create: `backend/src/audit-log/audit-log.controller.ts`
- Create: `backend/test/audit-log.e2e-spec.ts`
- Create: `frontend/src/pages/AuditLogPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

- [ ] **Step 1: Create AuditLogController**

Create `backend/src/audit-log/audit-log.controller.ts`:
```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogService } from './audit-log.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List audit logs with filters (admin only)' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: number,
    @Query('userId') userId?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditLogService.findAll({
      page: +page,
      limit: +limit,
      entity,
      entityId: entityId ? +entityId : undefined,
      userId: userId ? +userId : undefined,
      from,
      to,
    });
  }
}
```

- [ ] **Step 2: Register controller in AuditLogModule**

Update `backend/src/audit-log/audit-log.module.ts` to add the controller:
```typescript
import { AuditLogController } from './audit-log.controller';

// Add to @Module:
controllers: [AuditLogController],
```

- [ ] **Step 3: Write audit log E2E tests**

Create `backend/test/audit-log.e2e-spec.ts` covering:
- Creating a patient generates an audit log entry
- Updating a patient generates an audit log entry
- Deleting a patient generates an audit log entry
- `GET /api/audit-logs` returns paginated logs (admin only)
- `GET /api/audit-logs?entity=patients` filters by entity
- Non-admin gets 403 on audit-logs endpoint
- Login does NOT generate audit log entry
- Curacion edit does NOT generate audit log entry (uses CuracionEdit)

- [ ] **Step 4: Run E2E tests**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npx jest --config ./test/jest-e2e.json audit-log.e2e-spec --runInBand`
Expected: All PASS.

- [ ] **Step 5: Create AuditLogPage frontend component**

Create `frontend/src/pages/AuditLogPage.tsx`:
- Admin-only page
- Table with columns: Date, User, Action, Entity, Entity ID, IP
- Filters: entity type dropdown, user dropdown, date range
- Expandable rows to show payload JSON
- Pagination controls
- Uses `GET /api/audit-logs` with query params

- [ ] **Step 6: Add route to App.tsx**

Add to the router in `frontend/src/App.tsx`:
```tsx
<Route path="/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
```

Add link to admin sidebar/navigation.

- [ ] **Step 7: Run all tests**

Run backend unit + E2E + frontend unit tests.
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/audit-log/audit-log.controller.ts backend/src/audit-log/audit-log.module.ts backend/test/audit-log.e2e-spec.ts frontend/src/pages/AuditLogPage.tsx frontend/src/App.tsx
git commit -m "feat: add audit log controller, E2E tests, and admin frontend page"
```

---

## Task 15: Automated Local Backups

**Files:**
- Create: `scripts/backup-db.sh`
- Create: `scripts/.env.backup.example`
- Create: `scripts/com.curaciones.backup.plist`
- Modify: `.gitignore` (add scripts/.env.backup)

- [ ] **Step 1: Create backup script**

Create `scripts/backup-db.sh`:
```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.backup"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.backup.example and fill in credentials."
  exit 1
fi

source "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-$HOME/curaciones-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
FILENAME="curaciones-${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[$(date)] Starting backup..."
pg_dump "$DATABASE_URL" | gzip > "$FILEPATH"
echo "[$(date)] Backup saved to $FILEPATH ($(du -h "$FILEPATH" | cut -f1))"

# Rotate old backups
echo "[$(date)] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "curaciones-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] Backup complete."
```

- [ ] **Step 2: Create .env.backup.example**

Create `scripts/.env.backup.example`:
```bash
# Production database URL for backups
DATABASE_URL=postgresql://user:password@host:5432/curaciones

# Backup directory (default: ~/curaciones-backups)
# BACKUP_DIR=$HOME/curaciones-backups

# Days to keep backups (default: 14)
# RETENTION_DAYS=14
```

- [ ] **Step 3: Create launchd plist**

Create `scripts/com.curaciones.backup.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.curaciones.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>SCRIPT_PATH_PLACEHOLDER</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>LOG_PATH_PLACEHOLDER/backup.log</string>
  <key>StandardErrorPath</key>
  <string>LOG_PATH_PLACEHOLDER/backup-error.log</string>
</dict>
</plist>
```

Note: Replace `SCRIPT_PATH_PLACEHOLDER` with actual path to `scripts/backup-db.sh` and `LOG_PATH_PLACEHOLDER` with `~/curaciones-backups` during setup.

- [ ] **Step 4: Make backup script executable**

Run: `chmod +x scripts/backup-db.sh`

- [ ] **Step 5: Add .env.backup to .gitignore**

Append to `.gitignore`:
```
# Backup credentials
scripts/.env.backup
```

- [ ] **Step 6: Test backup script locally**

Run:
```bash
cp scripts/.env.backup.example scripts/.env.backup
# Edit scripts/.env.backup with real DATABASE_URL
./scripts/backup-db.sh
```
Expected: Backup file created in `~/curaciones-backups/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/backup-db.sh scripts/.env.backup.example scripts/com.curaciones.backup.plist .gitignore
git commit -m "feat: add automated local backup script with launchd scheduling"
```

---

## Summary

| Task | Area | Dependencies |
|------|------|-------------|
| 1 | Backend test infrastructure | None |
| 2 | Unit tests: Auth + Users | Task 1 |
| 3 | Unit tests: Patients | Task 1 |
| 4 | Unit tests: Curaciones, Appointments, Reports, Cycles, Guards | Task 1 |
| 5 | E2E tests: Auth, Health, Patients | Task 1 |
| 6 | E2E tests: Curaciones, Appointments, Reports, Cycles, Users | Task 1 |
| 7 | Frontend test setup | None |
| 8 | Frontend unit tests | Task 7 |
| 9 | Frontend E2E with Playwright | Task 7 |
| 10 | CI Pipeline | Tasks 1-9 |
| 11 | Swagger | None (parallel with testing) |
| 12 | Rate limiting | Task 1 (needs E2E infrastructure; modifies auth.e2e-spec.ts) |
| 13 | Audit log: entity + service + interceptor | Task 1 |
| 14 | Audit log: controller + E2E + frontend | Task 13 |
| 15 | Backups | None (independent) |

**Parallelizable groups:**
- Tasks 2, 3, 4 (backend unit tests — all depend on Task 1 only)
- Tasks 5, 6 (backend E2E — depend on Task 1 only)
- Tasks 7, 11, 15 (no dependencies, fully independent)
- Tasks 8, 9 (frontend tests — depend on Task 7 only)
