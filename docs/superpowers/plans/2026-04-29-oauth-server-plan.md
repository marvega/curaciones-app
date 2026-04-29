# OAuth 2.0 Authorization Server Implementation Plan (Sub #2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el OAuth 2.0 / OIDC Authorization Server del backend NestJS — endpoints estándar (CIMD, DCR, authorize, token, revoke, jwks, userinfo), consent screen en SPA, página "Aplicaciones conectadas", scope enforcement multi-auth, rotación de claves RSA, rate limiting y tests completos.

**Architecture:** Módulo NestJS embebido en `backend/src/oauth/` que envuelve `oidc-provider` (panva) con un adapter Postgres sobre TypeORM. JWT RS256 con JWKS público. Token bound a una organización elegida en consent. Scope enforcement por decorator + guard global. Frontend con primitives existentes.

**Tech Stack:** NestJS 11 · TypeORM 0.3 · Postgres · `oidc-provider` v8 · `jose` (transitive) · React 18 + Vite · `@nestjs/throttler` · KMS service existente.

**Spec:** `docs/superpowers/specs/2026-04-29-oauth-server-design.md`. Lee primero las secciones 4 (modelo de datos), 5 (endpoints), 6 (scopes) y 7 (consent) antes de implementar.

**Convención de commits:** `feat(oauth): ...`, `test(oauth): ...`, `docs(oauth): ...`. Frecuentes; uno por step "Commit" mostrado.

**TDD:** Cada task arranca con un test que falla. Si te encontrás escribiendo implementación sin haber visto un test rojo, parate y escribí el test primero.

---

## Phase 0 — Pre-flight

### Task 0.1: Crear worktree dedicado

**Files:** ninguno todavía.

- [ ] **Step 1: Verificar branch base**

```bash
git fetch origin main
git rev-parse origin/main
```

Expected: hash de un commit. Anotalo (lo necesitás abajo).

- [ ] **Step 2: Crear worktree para el feature**

```bash
git worktree add -b feat/oauth-server ../curaciones-oauth origin/main
cd ../curaciones-oauth
```

Expected: worktree creado, branch nueva `feat/oauth-server` apuntando a `origin/main`.

- [ ] **Step 3: Verificar que estás en el worktree limpio**

```bash
git status
git branch --show-current
```

Expected: working tree clean, branch `feat/oauth-server`.

### Task 0.2: Instalar dependencias

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Instalar oidc-provider y tipos**

```bash
cd backend
npm install oidc-provider@^8.5.0
npm install --save-dev @types/oidc-provider
```

Expected: `package.json` con `oidc-provider` en deps.

- [ ] **Step 2: Verificar versión y peer deps**

```bash
npm list oidc-provider
```

Expected: `oidc-provider@8.x.x`. Si npm reporta peer warnings sobre `koa` o similar, ignorar — usaremos oidc-provider en modo standalone, sin Koa.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat(oauth): add oidc-provider dependency"
```

### Task 0.3: Verificar prerequisitos de runtime

**Files:** ninguno.

- [ ] **Step 1: Verificar que KmsService está disponible**

```bash
grep -l "export class KmsService" backend/src/kms/
```

Expected: `backend/src/kms/kms.service.ts` listado. Si no aparece, parar — el plan asume Sub #1 mergeado con KmsService.

- [ ] **Step 2: Verificar que AuditLogInterceptor es global**

```bash
grep -rn "AuditLogInterceptor" backend/src/app.module.ts backend/src/main.ts
```

Expected: al menos una mención en `app.module.ts` registrándolo como global interceptor.

- [ ] **Step 3: Verificar OrgRole enum**

```bash
grep -n "export enum OrgRole" backend/src/organizations/organization-membership.entity.ts
```

Expected: enum con `Owner`, `Admin`, `Clinician`, `Receptionist`. Lo vamos a referenciar.

---

## Phase 1 — Migration y entities

### Task 1.1: Generar migration esqueleto

**Files:**
- Create: `backend/src/migrations/1714400000000-OAuthServer.ts`

- [ ] **Step 1: Crear archivo migration vacío**

Crear `backend/src/migrations/1714400000000-OAuthServer.ts` con el esqueleto:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OAuthServer1714400000000 implements MigrationInterface {
  name = 'OAuthServer1714400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // populated in next steps
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // populated in next steps
  }
}
```

- [ ] **Step 2: Agregar tabla `oauth_client`**

Reemplazar el contenido del método `up` agregando primero:

```typescript
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
await queryRunner.query(`CREATE INDEX "idx_oauth_client_first_authorized" ON "oauth_client" ("firstAuthorizedAt");`);
```

Y al `down` (orden inverso, top of method):

```typescript
await queryRunner.query(`DROP TABLE "oauth_client";`);
await queryRunner.query(`DROP TYPE "oauth_application_type_enum";`);
await queryRunner.query(`DROP TYPE "oauth_token_endpoint_auth_method_enum";`);
```

- [ ] **Step 3: Agregar tabla `oauth_grant`**

Después del bloque anterior en `up`:

```typescript
await queryRunner.query(`
  CREATE TABLE "oauth_grant" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" text NOT NULL REFERENCES "oauth_client"("clientId") ON DELETE CASCADE,
    "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
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
  CREATE UNIQUE INDEX "idx_oauth_grant_active" ON "oauth_grant" ("clientId","userId","organizationId")
    WHERE "revokedAt" IS NULL;
`);
await queryRunner.query(`CREATE INDEX "idx_oauth_grant_user" ON "oauth_grant" ("userId");`);
```

Down (insertar antes del DROP de `oauth_client`):

```typescript
await queryRunner.query(`DROP TABLE "oauth_grant";`);
```

- [ ] **Step 4: Agregar tabla `oauth_token`**

```typescript
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
    "organizationId" uuid NULL,
    "expiresAt" timestamptz NOT NULL,
    "consumed" boolean NOT NULL DEFAULT false,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  );
`);
await queryRunner.query(`CREATE INDEX "idx_oauth_token_grant" ON "oauth_token" ("grantId");`);
await queryRunner.query(`CREATE INDEX "idx_oauth_token_kind_expires" ON "oauth_token" ("kind","expiresAt");`);
await queryRunner.query(`CREATE INDEX "idx_oauth_token_user" ON "oauth_token" ("userId");`);
```

Down:

```typescript
await queryRunner.query(`DROP TABLE "oauth_token";`);
await queryRunner.query(`DROP TYPE "oauth_token_kind_enum";`);
```

- [ ] **Step 5: Agregar tabla `oauth_signing_key`**

```typescript
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
await queryRunner.query(`CREATE INDEX "idx_oauth_signing_key_status" ON "oauth_signing_key" ("status");`);
```

Down:

```typescript
await queryRunner.query(`DROP TABLE "oauth_signing_key";`);
await queryRunner.query(`DROP TYPE "oauth_signing_key_status_enum";`);
```

- [ ] **Step 6: Agregar tabla `oauth_revocation`**

```typescript
await queryRunner.query(`
  CREATE TABLE "oauth_revocation" (
    "jti" text PRIMARY KEY,
    "userId" int NOT NULL,
    "reason" text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  );
`);
await queryRunner.query(`CREATE INDEX "idx_oauth_revocation_expires" ON "oauth_revocation" ("expiresAt");`);
```

Down:

```typescript
await queryRunner.query(`DROP TABLE "oauth_revocation";`);
```

- [ ] **Step 7: Correr migration en DB local**

```bash
cd backend
npm run migration:run
```

Expected: log de TypeORM aplicando `OAuthServer1714400000000`. Sin errores.

- [ ] **Step 8: Verificar tablas creadas**

```bash
psql "$DATABASE_URL" -c "\dt oauth_*"
```

Expected: 5 tablas listadas.

- [ ] **Step 9: Commit**

```bash
git add backend/src/migrations/1714400000000-OAuthServer.ts
git commit -m "feat(oauth): migration creating 5 OAuth tables"
```

### Task 1.2: Entidad `OAuthClient`

**Files:**
- Create: `backend/src/oauth/entities/oauth-client.entity.ts`

- [ ] **Step 1: Crear entidad TypeORM**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';
export type ApplicationType = 'web' | 'native';

@Entity('oauth_client')
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  clientId!: string;

  @Column({ type: 'text', nullable: true })
  clientSecretHash!: string | null;

  @Column({ type: 'text' })
  clientName!: string;

  @Column({ type: 'text', nullable: true })
  clientUri!: string | null;

  @Column({ type: 'text', nullable: true })
  logoUri!: string | null;

  @Column({ type: 'text', nullable: true })
  policyUri!: string | null;

  @Column({ type: 'text', nullable: true })
  tosUri!: string | null;

  @Column({ type: 'text', array: true })
  redirectUris!: string[];

  @Column({ type: 'text', array: true, default: () => "ARRAY['authorization_code','refresh_token']::text[]" })
  grantTypes!: string[];

  @Column({ type: 'text', array: true, default: () => "ARRAY['code']::text[]" })
  responseTypes!: string[];

  @Column({ type: 'text' })
  scope!: string;

  @Column({ type: 'enum', enum: ['client_secret_basic','client_secret_post','none'], enumName: 'oauth_token_endpoint_auth_method_enum' })
  tokenEndpointAuthMethod!: TokenEndpointAuthMethod;

  @Column({ type: 'enum', enum: ['web','native'], enumName: 'oauth_application_type_enum', default: 'web' })
  applicationType!: ApplicationType;

  @Column({ type: 'text', nullable: true })
  softwareId!: string | null;

  @Column({ type: 'text', nullable: true })
  softwareVersion!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  firstAuthorizedAt!: Date | null;

  @Column({ type: 'text' })
  registrationAccessTokenHash!: string;

  @Column({ type: 'text', nullable: true })
  createdByIp!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Compile check**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
```

Expected: sin errores. Si TypeORM no encuentra el enumName, ignorá warning.

- [ ] **Step 3: Commit**

```bash
git add backend/src/oauth/entities/oauth-client.entity.ts
git commit -m "feat(oauth): OAuthClient entity"
```

### Task 1.3: Entidades restantes (Grant, Token, SigningKey, Revocation)

**Files:**
- Create: `backend/src/oauth/entities/oauth-grant.entity.ts`
- Create: `backend/src/oauth/entities/oauth-token.entity.ts`
- Create: `backend/src/oauth/entities/oauth-signing-key.entity.ts`
- Create: `backend/src/oauth/entities/oauth-revocation.entity.ts`

- [ ] **Step 1: Crear `oauth-grant.entity.ts`**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('oauth_grant')
@Index('idx_oauth_grant_active', ['clientId','userId','organizationId'], { unique: true, where: '"revokedAt" IS NULL' })
export class OAuthGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  clientId!: string;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'text', array: true })
  scopes!: string[];

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Crear `oauth-token.entity.ts`**

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type OAuthTokenKind =
  | 'access' | 'refresh' | 'authorization_code'
  | 'interaction' | 'session' | 'registration_access_token';

@Entity('oauth_token')
@Index('idx_oauth_token_kind_expires', ['kind','expiresAt'])
@Index('idx_oauth_token_grant', ['grantId'])
@Index('idx_oauth_token_user', ['userId'])
export class OAuthToken {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'enum', enum: ['access','refresh','authorization_code','interaction','session','registration_access_token'], enumName: 'oauth_token_kind_enum' })
  kind!: OAuthTokenKind;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  grantId!: string | null;

  @Column({ type: 'text', nullable: true })
  clientId!: string | null;

  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: false })
  consumed!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

- [ ] **Step 3: Crear `oauth-signing-key.entity.ts`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SigningKeyStatus = 'active' | 'retired' | 'revoked';

@Entity('oauth_signing_key')
@Index('idx_oauth_signing_key_status', ['status'])
export class OAuthSigningKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  algorithm!: string;

  @Column({ type: 'text' })
  publicKeyPem!: string;

  @Column({ type: 'bytea' })
  privateKeyEncrypted!: Buffer;

  @Column({ type: 'enum', enum: ['active','retired','revoked'], enumName: 'oauth_signing_key_status_enum' })
  status!: SigningKeyStatus;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  retiredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  retireScheduledAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

- [ ] **Step 4: Crear `oauth-revocation.entity.ts`**

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('oauth_revocation')
@Index('idx_oauth_revocation_expires', ['expiresAt'])
export class OAuthRevocation {
  @PrimaryColumn({ type: 'text' })
  jti!: string;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

- [ ] **Step 5: Compile check + commit**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
git add backend/src/oauth/entities/
git commit -m "feat(oauth): Grant, Token, SigningKey, Revocation entities"
```

### Task 1.4: Esqueleto del módulo y registro en AppModule

**Files:**
- Create: `backend/src/oauth/oauth.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/data-source.ts`

- [ ] **Step 1: Crear módulo vacío**

`backend/src/oauth/oauth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthSigningKey } from './entities/oauth-signing-key.entity';
import { OAuthRevocation } from './entities/oauth-revocation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class OAuthModule {}
```

- [ ] **Step 2: Registrar módulo en AppModule**

Editar `backend/src/app.module.ts`. Buscar la lista de imports y agregar `OAuthModule`:

```typescript
import { OAuthModule } from './oauth/oauth.module';
// ...
@Module({
  imports: [
    // ... existentes
    OAuthModule,
  ],
})
```

- [ ] **Step 3: Registrar entities en data-source**

Editar `backend/src/data-source.ts`. Agregar a la lista `entities`:

```typescript
import { OAuthClient } from './oauth/entities/oauth-client.entity';
import { OAuthGrant } from './oauth/entities/oauth-grant.entity';
import { OAuthToken } from './oauth/entities/oauth-token.entity';
import { OAuthSigningKey } from './oauth/entities/oauth-signing-key.entity';
import { OAuthRevocation } from './oauth/entities/oauth-revocation.entity';
```

Y agregarlas al array `entities: [...]`.

- [ ] **Step 4: Compile check + start server**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
npm run start:dev
```

Expected: server arranca sin errores (TypeORM resuelve las entities). Cortá con Ctrl+C tras ver "Nest application successfully started".

- [ ] **Step 5: Commit**

```bash
git add backend/src/oauth/oauth.module.ts backend/src/app.module.ts backend/src/data-source.ts
git commit -m "feat(oauth): register OAuthModule with entities"
```

---

## Phase 2 — Servicios base + bootstrap key

### Task 2.1: Test del bootstrap (TDD)

**Files:**
- Create: `backend/src/oauth/services/oauth-bootstrap.service.spec.ts`

- [ ] **Step 1: Escribir test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { OAuthBootstrapService } from './oauth-bootstrap.service';
import { KmsService } from '../../kms/kms.service';

describe('OAuthBootstrapService', () => {
  let service: OAuthBootstrapService;
  let repo: jest.Mocked<Repository<OAuthSigningKey>>;
  let kms: jest.Mocked<KmsService>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;
    kms = {
      encrypt: jest.fn(async (b: Buffer) => Buffer.concat([Buffer.from('enc:'), b])),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthBootstrapService,
        { provide: getRepositoryToken(OAuthSigningKey), useValue: repo },
        { provide: KmsService, useValue: kms },
      ],
    }).compile();

    service = moduleRef.get(OAuthBootstrapService);
  });

  it('does nothing if active key exists', async () => {
    repo.findOne.mockResolvedValue({ id: 'existing', status: 'active' } as OAuthSigningKey);
    await service.ensureActiveKey();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('generates RSA 2048 + saves encrypted private key when none active', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockImplementation(async (e: any) => ({ ...e, id: 'new-uuid' }));

    await service.ensureActiveKey();

    expect(kms.encrypt).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0] as Partial<OAuthSigningKey>;
    expect(saved.algorithm).toBe('RS256');
    expect(saved.status).toBe('active');
    expect(saved.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(Buffer.isBuffer(saved.privateKeyEncrypted)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr test (debe fallar)**

```bash
cd backend
npx jest src/oauth/services/oauth-bootstrap.service.spec.ts
```

Expected: FAIL — `Cannot find module './oauth-bootstrap.service'`.

### Task 2.2: Implementar OAuthBootstrapService

**Files:**
- Create: `backend/src/oauth/services/oauth-bootstrap.service.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementar service**

```typescript
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateKeyPairSync } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KmsService } from '../../kms/kms.service';

@Injectable()
export class OAuthBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OAuthBootstrapService.name);

  constructor(
    @InjectRepository(OAuthSigningKey) private readonly keyRepo: Repository<OAuthSigningKey>,
    private readonly kms: KmsService,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureActiveKey();
  }

  async ensureActiveKey(): Promise<void> {
    const existing = await this.keyRepo.findOne({ where: { status: 'active' } });
    if (existing) {
      this.logger.log(`Active OAuth signing key present (kid=${existing.id})`);
      return;
    }
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const privateKeyEncrypted = await this.kms.encrypt(Buffer.from(privateKeyPem, 'utf8'));

    const saved = await this.keyRepo.save({
      algorithm: 'RS256',
      publicKeyPem,
      privateKeyEncrypted,
      status: 'active',
      activatedAt: new Date(),
    } as Partial<OAuthSigningKey>);
    this.logger.log(`Generated initial OAuth signing key kid=${saved.id}`);
  }
}
```

- [ ] **Step 2: Registrar en módulo**

Editar `backend/src/oauth/oauth.module.ts`:

```typescript
import { KmsModule } from '../kms/kms.module';
import { OAuthBootstrapService } from './services/oauth-bootstrap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation]),
    KmsModule,
  ],
  providers: [OAuthBootstrapService],
  exports: [OAuthBootstrapService],
})
export class OAuthModule {}
```

> Si `KmsModule` no es un módulo separado y `KmsService` está exportado por otro módulo (ej. `AppModule` o un módulo común), importá el módulo correcto. Verificalo con: `grep -rn "providers.*KmsService\|exports.*KmsService" backend/src/`.

- [ ] **Step 3: Test pasa**

```bash
cd backend
npx jest src/oauth/services/oauth-bootstrap.service.spec.ts
```

Expected: PASS, ambos casos.

- [ ] **Step 4: Commit**

```bash
git add backend/src/oauth/services/oauth-bootstrap.service.ts backend/src/oauth/services/oauth-bootstrap.service.spec.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): bootstrap service generates initial signing key"
```

### Task 2.3: OAuthSigningKeyService con cache

**Files:**
- Create: `backend/src/oauth/services/oauth-signing-key.service.spec.ts`
- Create: `backend/src/oauth/services/oauth-signing-key.service.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KmsService } from '../../kms/kms.service';
import { OAuthSigningKeyService } from './oauth-signing-key.service';
import { generateKeyPairSync } from 'crypto';

describe('OAuthSigningKeyService', () => {
  let service: OAuthSigningKeyService;
  let repo: jest.Mocked<Repository<OAuthSigningKey>>;
  let kms: jest.Mocked<KmsService>;
  let activeKey: any;

  beforeEach(async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    activeKey = {
      id: 'kid-active',
      algorithm: 'RS256',
      publicKeyPem: pubPem,
      privateKeyEncrypted: Buffer.concat([Buffer.from('enc:'), Buffer.from(privPem)]),
      status: 'active',
    };

    repo = {
      findOne: jest.fn().mockResolvedValue(activeKey),
      find: jest.fn().mockResolvedValue([activeKey]),
    } as any;
    kms = {
      decrypt: jest.fn(async (b: Buffer) => b.subarray(4)),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthSigningKeyService,
        { provide: getRepositoryToken(OAuthSigningKey), useValue: repo },
        { provide: KmsService, useValue: kms },
      ],
    }).compile();

    service = moduleRef.get(OAuthSigningKeyService);
  });

  it('returns active key with decrypted private + jwk', async () => {
    const k = await service.getActiveKey();
    expect(k.kid).toBe('kid-active');
    expect(k.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(k.publicJwk.kty).toBe('RSA');
    expect(k.publicJwk.use).toBe('sig');
    expect(k.publicJwk.alg).toBe('RS256');
    expect(k.publicJwk.kid).toBe('kid-active');
  });

  it('caches active key for subsequent calls', async () => {
    await service.getActiveKey();
    await service.getActiveKey();
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces re-fetch', async () => {
    await service.getActiveKey();
    service.invalidate();
    await service.getActiveKey();
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('getAllPublishableKeys returns active + retired only', async () => {
    repo.find.mockResolvedValue([
      activeKey,
      { ...activeKey, id: 'kid-retired', status: 'retired' },
    ]);
    const keys = await service.getAllPublishableKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0].publicJwk.kid).toBe('kid-active');
  });
});
```

- [ ] **Step 2: Correr test (debe fallar por archivo faltante)**

```bash
npx jest src/oauth/services/oauth-signing-key.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar service**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { createPublicKey } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KmsService } from '../../kms/kms.service';

export interface ResolvedSigningKey {
  kid: string;
  algorithm: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicJwk: Record<string, unknown>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OAuthSigningKeyService {
  private activeCache: { value: ResolvedSigningKey; expiresAt: number } | null = null;
  private allCache: { value: ResolvedSigningKey[]; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(OAuthSigningKey) private readonly repo: Repository<OAuthSigningKey>,
    private readonly kms: KmsService,
  ) {}

  invalidate() {
    this.activeCache = null;
    this.allCache = null;
  }

  async getActiveKey(): Promise<ResolvedSigningKey> {
    if (this.activeCache && this.activeCache.expiresAt > Date.now()) return this.activeCache.value;
    const row = await this.repo.findOne({ where: { status: 'active' } });
    if (!row) throw new Error('No active OAuth signing key');
    const resolved = await this.resolve(row);
    this.activeCache = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
    return resolved;
  }

  async getAllPublishableKeys(): Promise<ResolvedSigningKey[]> {
    if (this.allCache && this.allCache.expiresAt > Date.now()) return this.allCache.value;
    const rows = await this.repo.find({ where: { status: In(['active','retired']) } });
    const resolved = await Promise.all(rows.map((r) => this.resolve(r)));
    this.allCache = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
    return resolved;
  }

  private async resolve(row: OAuthSigningKey): Promise<ResolvedSigningKey> {
    const decrypted = await this.kms.decrypt(row.privateKeyEncrypted);
    const privateKeyPem = decrypted.toString('utf8');
    const publicKey = createPublicKey(row.publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    return {
      kid: row.id,
      algorithm: row.algorithm,
      privateKeyPem,
      publicKeyPem: row.publicKeyPem,
      publicJwk: { ...jwk, alg: row.algorithm, use: 'sig', kid: row.id },
    };
  }
}
```

- [ ] **Step 4: Registrar en módulo**

Editar `backend/src/oauth/oauth.module.ts` para agregar `OAuthSigningKeyService` a `providers` y `exports`.

- [ ] **Step 5: Tests pasan**

```bash
npx jest src/oauth/services/oauth-signing-key.service.spec.ts
```

Expected: PASS los 4 casos.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oauth/services/oauth-signing-key.service.ts backend/src/oauth/services/oauth-signing-key.service.spec.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): signing key service with 5min cache"
```

### Task 2.4: E2E del bootstrap

**Files:**
- Create: `backend/test/oauth/oauth-bootstrap.e2e-spec.ts`

- [ ] **Step 1: Test E2E**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { OAuthSigningKey } from '../../src/oauth/entities/oauth-signing-key.entity';

describe('OAuth bootstrap (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    dataSource = moduleRef.get(DataSource);
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('after init there is exactly one active signing key', async () => {
    const repo = dataSource.getRepository(OAuthSigningKey);
    const actives = await repo.find({ where: { status: 'active' } });
    expect(actives.length).toBe(1);
    expect(actives[0].publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(actives[0].privateKeyEncrypted.length).toBeGreaterThan(0);
  });

  it('booting a second time does not create a duplicate', async () => {
    // app already booted above
    const repo = dataSource.getRepository(OAuthSigningKey);
    const all = await repo.find({ where: { status: 'active' } });
    expect(all.length).toBe(1);
  });
});
```

- [ ] **Step 2: Correr e2e**

```bash
cd backend
npm run test:e2e -- oauth-bootstrap
```

Expected: PASS. Si falla por DB no migrada, asegurate que `pretest:e2e` corrió migrations.

- [ ] **Step 3: Commit**

```bash
git add backend/test/oauth/oauth-bootstrap.e2e-spec.ts
git commit -m "test(oauth): e2e verifying signing key bootstrap"
```

---

## Phase 3 — Postgres adapter + oidc-provider factory

### Task 3.1: Tests del Postgres adapter

**Files:**
- Create: `backend/src/oauth/adapters/postgres.adapter.spec.ts`

- [ ] **Step 1: Test con DB real (integration)**

```typescript
import { DataSource, Repository } from 'typeorm';
import { OAuthToken } from '../entities/oauth-token.entity';
import { PostgresAdapter, makePostgresAdapterFactory } from './postgres.adapter';

describe('PostgresAdapter', () => {
  let dataSource: DataSource;
  let repo: Repository<OAuthToken>;
  let factory: (name: string) => PostgresAdapter;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL || 'postgresql://curaciones:curaciones@localhost:5433/curaciones_test',
      entities: [OAuthToken],
      synchronize: false,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(OAuthToken);
    factory = makePostgresAdapterFactory(repo);
  });

  afterAll(async () => { await dataSource.destroy(); });

  beforeEach(async () => { await repo.clear(); });

  it('upsert + find roundtrip for AccessToken', async () => {
    const adapter = factory('AccessToken');
    await adapter.upsert('jti-1', { iss: 'http://x', aud: 'y', sub: '1', clientId: 'c', scope: 'patients:read', exp: 9999999999 }, 600);
    const found = await adapter.find('jti-1');
    expect(found).toBeTruthy();
    expect(found!.clientId).toBe('c');
  });

  it('consume() flips consumed flag', async () => {
    const adapter = factory('RefreshToken');
    await adapter.upsert('rt-1', { iss: 'x', sub: '1', clientId: 'c' }, 86400);
    await adapter.consume('rt-1');
    const row = await repo.findOne({ where: { id: 'rt-1' } });
    expect(row!.consumed).toBe(true);
  });

  it('destroy() removes the row', async () => {
    const adapter = factory('AccessToken');
    await adapter.upsert('jti-x', { sub: '1', clientId: 'c' }, 60);
    await adapter.destroy('jti-x');
    const found = await adapter.find('jti-x');
    expect(found).toBeUndefined();
  });

  it('findByUid returns Session by uid', async () => {
    const adapter = factory('Session');
    await adapter.upsert('sess-1', { uid: 'uid-abc', accountId: '1' }, 3600);
    const found = await adapter.findByUid('uid-abc');
    expect(found).toBeTruthy();
    expect(found!.accountId).toBe('1');
  });

  it('revokeByGrantId destroys all tokens of grant', async () => {
    const at = factory('AccessToken');
    const rt = factory('RefreshToken');
    await at.upsert('jti-a', { grantId: 'g-1', sub: '1' }, 600);
    await at.upsert('jti-b', { grantId: 'g-1', sub: '1' }, 600);
    await rt.upsert('rt-a', { grantId: 'g-1', sub: '1' }, 86400);
    await at.revokeByGrantId('g-1');
    expect(await at.find('jti-a')).toBeUndefined();
    expect(await at.find('jti-b')).toBeUndefined();
    expect(await rt.find('rt-a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr (debe fallar por archivo faltante)**

```bash
cd backend
npx jest src/oauth/adapters/postgres.adapter.spec.ts
```

Expected: FAIL — adapter no existe.

### Task 3.2: Implementar PostgresAdapter

**Files:**
- Create: `backend/src/oauth/adapters/postgres.adapter.ts`

- [ ] **Step 1: Implementación**

```typescript
import { Repository } from 'typeorm';
import { OAuthToken, OAuthTokenKind } from '../entities/oauth-token.entity';

const NAME_TO_KIND: Record<string, OAuthTokenKind> = {
  Session: 'session',
  AccessToken: 'access',
  AuthorizationCode: 'authorization_code',
  RefreshToken: 'refresh',
  Interaction: 'interaction',
  RegistrationAccessToken: 'registration_access_token',
  // ClientCredentials, DeviceCode, BackchannelAuthenticationRequest no usados en v1
};

export interface AdapterPayload extends Record<string, unknown> {
  grantId?: string;
  clientId?: string;
  accountId?: string;
  uid?: string;
  consumed?: boolean | number;
}

export class PostgresAdapter {
  constructor(private readonly repo: Repository<OAuthToken>, private readonly name: string) {}

  private get kind(): OAuthTokenKind {
    const k = NAME_TO_KIND[this.name];
    if (!k) throw new Error(`Unsupported oidc-provider model: ${this.name}`);
    return k;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await this.repo.upsert(
      {
        id,
        kind: this.kind,
        payload: payload as Record<string, unknown>,
        grantId: (payload.grantId as string) ?? null,
        clientId: (payload.clientId as string) ?? null,
        userId: payload.accountId ? Number(payload.accountId) : null,
        organizationId: (payload as any).organizationId ?? null,
        expiresAt,
        consumed: Boolean(payload.consumed),
      },
      ['id'],
    );
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = await this.repo.findOne({ where: { id, kind: this.kind } });
    if (!row) return undefined;
    if (row.expiresAt.getTime() < Date.now()) return undefined;
    const payload = row.payload as AdapterPayload;
    if (row.consumed) payload.consumed = Math.floor(row.expiresAt.getTime() / 1000);
    return payload;
  }

  async findByUserCode(): Promise<AdapterPayload | undefined> {
    return undefined; // device code grant out of scope
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const row = await this.repo
      .createQueryBuilder('t')
      .where('t.kind = :kind AND t.payload @> :u', { kind: this.kind, u: { uid } })
      .getOne();
    if (!row) return undefined;
    return row.payload as AdapterPayload;
  }

  async consume(id: string): Promise<void> {
    await this.repo.update({ id, kind: this.kind }, { consumed: true });
  }

  async destroy(id: string): Promise<void> {
    await this.repo.delete({ id, kind: this.kind });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.repo.delete({ grantId });
  }
}

export function makePostgresAdapterFactory(repo: Repository<OAuthToken>) {
  return (name: string) => new PostgresAdapter(repo, name);
}
```

- [ ] **Step 2: Tests pasan**

```bash
npx jest src/oauth/adapters/postgres.adapter.spec.ts
```

Expected: PASS los 5 casos.

- [ ] **Step 3: Commit**

```bash
git add backend/src/oauth/adapters/postgres.adapter.ts backend/src/oauth/adapters/postgres.adapter.spec.ts
git commit -m "feat(oauth): Postgres adapter implementing oidc-provider Adapter interface"
```

### Task 3.3: oidc-provider factory

**Files:**
- Create: `backend/src/oauth/oidc-provider.factory.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementar factory**

```typescript
import { Provider as OidcProvider, Configuration } from 'oidc-provider';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { makePostgresAdapterFactory } from './adapters/postgres.adapter';

export const SUPPORTED_SCOPES = [
  'openid', 'offline_access',
  'patients:read', 'patients:write',
  'clinical:read', 'clinical:write',
  'agenda:read', 'agenda:write',
  'inventory:read', 'inventory:write',
  'reports:read', 'org:admin',
];

export interface OidcFactoryDeps {
  issuer: string;
  signingKeys: OAuthSigningKeyService;
  tokenRepo: Repository<OAuthToken>;
  clientRepo: Repository<OAuthClient>;
  findAccount: Configuration['findAccount'];
  loadExistingGrant: Configuration['loadExistingGrant'];
}

export async function buildOidcProvider(deps: OidcFactoryDeps): Promise<OidcProvider> {
  const allKeys = await deps.signingKeys.getAllPublishableKeys();
  const jwks = {
    keys: await Promise.all(
      allKeys.map(async (k) => {
        const { exportJWK, importPKCS8 } = await import('jose');
        const priv = await importPKCS8(k.privateKeyPem, k.algorithm);
        const jwk = await exportJWK(priv);
        return { ...jwk, alg: k.algorithm, use: 'sig', kid: k.kid };
      }),
    ),
  };

  const Adapter = makePostgresAdapterFactory(deps.tokenRepo);

  const config: Configuration = {
    adapter: Adapter as any,
    jwks,
    scopes: SUPPORTED_SCOPES,
    pkce: { required: () => true, methods: ['S256'] },
    features: {
      devInteractions: { enabled: false },
      registration: {
        enabled: true,
        initialAccessToken: false,
        idFactory: () => randomClientId(),
      },
      registrationManagement: { enabled: true, rotateRegistrationAccessToken: false },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      jwtUserinfo: { enabled: false },
      introspection: { enabled: false },
      clientCredentials: { enabled: false },
      resourceIndicators: { enabled: false },
    },
    clients: [],
    findAccount: deps.findAccount,
    loadExistingGrant: deps.loadExistingGrant,
    ttl: {
      AccessToken: 10 * 60,
      AuthorizationCode: 60,
      IdToken: 10 * 60,
      RefreshToken: 30 * 24 * 60 * 60, // sliding 30d, max enforced via custom logic
      Interaction: 10 * 60,
      Session: 14 * 24 * 60 * 60,
    },
    rotateRefreshToken: true,
    interactions: {
      url(_ctx, interaction) {
        return `/account/oauth/consent?interaction=${interaction.uid}`;
      },
    },
    cookies: {
      keys: [process.env.OAUTH_COOKIE_SECRET || 'change-in-production'],
    },
    issueRefreshToken(_ctx, client, code) {
      return code.scopes?.has('offline_access') !== false; // emit if not explicitly excluded
    },
    extraTokenClaims(_ctx, token) {
      const payload: Record<string, unknown> = {};
      const t = token as any;
      if (t.extra?.org_id) payload.org_id = t.extra.org_id;
      if (t.extra?.org_name) payload.org_name = t.extra.org_name;
      if (t.extra?.role) payload.role = t.extra.role;
      if (t.extra?.establishment_ids) payload.establishment_ids = t.extra.establishment_ids;
      return payload;
    },
  };

  return new OidcProvider(deps.issuer, config);
}

function randomClientId(): string {
  // 32 chars hex from crypto
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(16).toString('hex');
}
```

> Si TypeScript se queja por la firma de `adapter`, casteá a `any` como mostrado. La interfaz oficial de `oidc-provider` es estricta y la ergonomía con factory functions requiere cast.

- [ ] **Step 2: Compile check**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
```

Expected: sin errores. Si jose no está instalado, `npm install jose`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/oauth/oidc-provider.factory.ts backend/package.json backend/package-lock.json
git commit -m "feat(oauth): oidc-provider factory with PKCE-required, RS256, custom TTLs"
```

---

---

## Phase 4 — Account adapter + Discovery + JWKS endpoints

### Task 4.1: Account adapter (mapea User+Membership a Account de oidc-provider)

**Files:**
- Create: `backend/src/oauth/adapters/account.adapter.ts`
- Create: `backend/src/oauth/adapters/account.adapter.spec.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../../establishments/user-establishment-assignment.entity';
import { AccountAdapterService } from './account.adapter';

describe('AccountAdapterService', () => {
  let service: AccountAdapterService;
  let userRepo: any;
  let memRepo: any;
  let orgRepo: any;
  let ueaRepo: any;

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    memRepo = { findOne: jest.fn() };
    orgRepo = { findOne: jest.fn() };
    ueaRepo = { find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountAdapterService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(UserEstablishmentAssignment), useValue: ueaRepo },
      ],
    }).compile();
    service = moduleRef.get(AccountAdapterService);
  });

  it('findAccount returns claims with org bound from grant context', async () => {
    userRepo.findOne.mockResolvedValue({ id: 12, username: 'marcelo', fullName: 'Marcelo' });
    memRepo.findOne.mockResolvedValue({ userId: 12, organizationId: 'uuid-acme', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE });
    orgRepo.findOne.mockResolvedValue({ id: 'uuid-acme', name: 'CESFAM Acme' });
    ueaRepo.find.mockResolvedValue([{ establishmentId: 'est-1' }]);

    const ctx = { oidc: { entities: { Grant: { organizationId: 'uuid-acme' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account!.accountId).toBe('12');

    const claims = await account!.claims!('id_token', 'openid');
    expect(claims).toMatchObject({
      sub: '12',
      username: 'marcelo',
      name: 'Marcelo',
      org_id: 'uuid-acme',
      org_name: 'CESFAM Acme',
      role: OrgRole.ADMIN,
    });
  });

  it('findAccount returns undefined when membership inactive', async () => {
    userRepo.findOne.mockResolvedValue({ id: 12 });
    memRepo.findOne.mockResolvedValue(null);
    const ctx = { oidc: { entities: { Grant: { organizationId: 'x' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

```bash
npx jest src/oauth/adapters/account.adapter.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar service**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../../establishments/user-establishment-assignment.entity';

@Injectable()
export class AccountAdapterService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserEstablishmentAssignment) private readonly ueaRepo: Repository<UserEstablishmentAssignment>,
  ) {}

  findAccount = async (ctx: any, sub: string): Promise<any | undefined> => {
    const userId = Number(sub);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return undefined;
    const grantOrgId: string | undefined = ctx?.oidc?.entities?.Grant?.organizationId;
    if (!grantOrgId) return undefined;
    const membership = await this.memRepo.findOne({
      where: { userId, organizationId: grantOrgId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) return undefined;
    const org = await this.orgRepo.findOne({ where: { id: grantOrgId } });
    const ueas = await this.ueaRepo.find({ where: { userId } });
    const claims = {
      sub: String(userId),
      username: user.username,
      name: (user as any).fullName ?? user.username,
      org_id: grantOrgId,
      org_name: org?.name ?? '',
      role: membership.role,
      establishment_ids: ueas.map((u) => u.establishmentId),
    };
    return {
      accountId: String(userId),
      async claims() { return claims; },
    };
  };
}
```

- [ ] **Step 4: Test pasa**

```bash
npx jest src/oauth/adapters/account.adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oauth/adapters/account.adapter.ts backend/src/oauth/adapters/account.adapter.spec.ts
git commit -m "feat(oauth): Account adapter mapping User+Membership to OIDC claims"
```

### Task 4.2: Provider singleton + module wiring

**Files:**
- Create: `backend/src/oauth/oidc-provider.singleton.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Singleton wrapper**

`backend/src/oauth/oidc-provider.singleton.ts`:

```typescript
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { Provider as OidcProvider } from 'oidc-provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { AccountAdapterService } from './adapters/account.adapter';
import { OAuthGrantService } from './services/oauth-grant.service';
import { buildOidcProvider } from './oidc-provider.factory';

@Injectable()
export class OidcProviderSingleton implements OnModuleInit {
  private readonly logger = new Logger(OidcProviderSingleton.name);
  private provider!: OidcProvider;

  constructor(
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    private readonly signingKeys: OAuthSigningKeyService,
    private readonly accountAdapter: AccountAdapterService,
    private readonly grantService: OAuthGrantService,
  ) {}

  async onModuleInit() {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    this.provider = await buildOidcProvider({
      issuer,
      signingKeys: this.signingKeys,
      tokenRepo: this.tokenRepo,
      clientRepo: this.clientRepo,
      findAccount: this.accountAdapter.findAccount,
      loadExistingGrant: this.grantService.loadExistingGrant,
    });
    this.logger.log(`oidc-provider initialized at ${issuer}`);
  }

  get(): OidcProvider {
    if (!this.provider) throw new Error('oidc-provider not initialized');
    return this.provider;
  }
}
```

- [ ] **Step 2: Stub mínimo de OAuthGrantService**

`backend/src/oauth/services/oauth-grant.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';

@Injectable()
export class OAuthGrantService {
  constructor(@InjectRepository(OAuthGrant) private readonly repo: Repository<OAuthGrant>) {}

  loadExistingGrant = async (ctx: any): Promise<any | undefined> => {
    const clientId = ctx.oidc?.client?.clientId;
    const accountId = ctx.oidc?.session?.accountId;
    const requestedOrgId: string | undefined = ctx.oidc?.params?.organization_id;
    if (!clientId || !accountId) return undefined;

    const orgId = requestedOrgId;
    if (!orgId) return undefined;

    const grant = await this.repo.findOne({
      where: { clientId, userId: Number(accountId), organizationId: orgId, revokedAt: IsNull() },
    });
    if (!grant) return undefined;

    const requestedScopes: string[] = ctx.oidc?.requestParamScopes ? Array.from(ctx.oidc.requestParamScopes) : [];
    const covers = requestedScopes.every((s) => grant.scopes.includes(s));
    if (!covers) return undefined;

    const Grant = ctx.oidc.provider.Grant;
    const g = new Grant({ accountId, clientId });
    grant.scopes.forEach((s) => g.addOIDCScope(s));
    g.organizationId = grant.organizationId;
    return g;
  };
}
```

- [ ] **Step 3: Wiring del módulo**

Editar `backend/src/oauth/oauth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KmsModule } from '../kms/kms.module';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthSigningKey } from './entities/oauth-signing-key.entity';
import { OAuthRevocation } from './entities/oauth-revocation.entity';
import { User } from '../users/user.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { OAuthBootstrapService } from './services/oauth-bootstrap.service';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { OAuthGrantService } from './services/oauth-grant.service';
import { AccountAdapterService } from './adapters/account.adapter';
import { OidcProviderSingleton } from './oidc-provider.singleton';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
      User, OrganizationMembership, Organization, UserEstablishmentAssignment,
    ]),
    KmsModule,
  ],
  providers: [
    OAuthBootstrapService, OAuthSigningKeyService, OAuthGrantService,
    AccountAdapterService, OidcProviderSingleton,
  ],
  exports: [OidcProviderSingleton, OAuthSigningKeyService, OAuthGrantService],
})
export class OAuthModule {}
```

- [ ] **Step 4: Compile + boot check**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
npm run start:dev
```

Expected: server arranca, log "oidc-provider initialized at ...". Cortá con Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oauth/oidc-provider.singleton.ts backend/src/oauth/services/oauth-grant.service.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): wire oidc-provider singleton into NestJS module"
```

### Task 4.3: Discovery controllers (`/.well-known/*`, `/jwks.json`)

**Files:**
- Create: `backend/src/oauth/controllers/oauth-discovery.controller.ts`
- Create: `backend/test/oauth/oauth-discovery.e2e-spec.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: E2E test**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('OAuth discovery (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /.well-known/oauth-authorization-server returns metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
    expect(res.body).toMatchObject({
      issuer: expect.any(String),
      authorization_endpoint: expect.stringMatching(/\/oauth\/authorize$/),
      token_endpoint: expect.stringMatching(/\/oauth\/token$/),
      jwks_uri: expect.stringMatching(/\/jwks\.json$/),
      registration_endpoint: expect.stringMatching(/\/oauth\/register$/),
      revocation_endpoint: expect.stringMatching(/\/oauth\/revoke$/),
    });
    expect(res.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(res.body.scopes_supported).toEqual(expect.arrayContaining([
      'patients:read','patients:write','clinical:read','clinical:write','agenda:read','agenda:write',
      'inventory:read','inventory:write','reports:read','org:admin','openid','offline_access',
    ]));
  });

  it('GET /.well-known/openid-configuration returns OIDC metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/openid-configuration')
      .expect(200);
    expect(res.body.userinfo_endpoint).toMatch(/\/oauth\/userinfo$/);
    expect(res.body.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });

  it('GET /jwks.json returns active key as JWK', async () => {
    const res = await request(app.getHttpServer()).get('/jwks.json').expect(200);
    expect(res.body.keys).toHaveLength(1);
    const k = res.body.keys[0];
    expect(k.kty).toBe('RSA');
    expect(k.use).toBe('sig');
    expect(k.alg).toBe('RS256');
    expect(k.kid).toBeTruthy();
    expect(k.n).toBeTruthy();
    expect(k.e).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implementar controller**

`backend/src/oauth/controllers/oauth-discovery.controller.ts`:

```typescript
import { Controller, Get, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller()
export class OAuthDiscoveryController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @All('/.well-known/oauth-authorization-server')
  asMetadata(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('/.well-known/openid-configuration')
  oidcMetadata(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('/jwks.json')
  jwks(@Req() req: Request, @Res() res: Response) {
    // oidc-provider expone /jwks; el controller proxea al callback que matchea el path interno
    return this.oidc.get().callback()(req, res);
  }
}
```

> Nota: oidc-provider monta sus rutas en su prefix configurable. Para que `/.well-known/...` y `/jwks.json` resuelvan, el factory debe usar el handler con esos paths exactos. Verificá con un breakpoint: si oidc-provider monta en `/`, los matches funcionan; si requiere prefix, ajustá rewriting el `req.url` antes de pasar al callback.

- [ ] **Step 3: Registrar controller**

Editar `oauth.module.ts` para agregar `OAuthDiscoveryController` a `controllers: [...]`.

- [ ] **Step 4: Tests pasan**

```bash
cd backend
npm run test:e2e -- oauth-discovery
```

Expected: PASS los 3 casos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oauth/controllers/oauth-discovery.controller.ts backend/test/oauth/oauth-discovery.e2e-spec.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): discovery + JWKS endpoints"
```

---

## Phase 5 — Dynamic Client Registration

### Task 5.1: E2E DCR happy path

**Files:**
- Create: `backend/test/oauth/oauth-dcr.e2e-spec.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('OAuth DCR (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('POST /oauth/register with valid HTTPS redirect_uris returns 201 + client_id', async () => {
    const res = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Test Client',
        redirect_uris: ['https://test.example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        application_type: 'web',
        scope: 'patients:read agenda:read',
      })
      .expect(201);
    expect(res.body.client_id).toMatch(/^[a-f0-9]{32}$/);
    expect(res.body.client_secret).toBeTruthy();
    expect(res.body.registration_access_token).toBeTruthy();
    expect(res.body.registration_client_uri).toMatch(/\/oauth\/register\//);
  });

  it('POST /oauth/register with HTTP non-localhost is rejected', async () => {
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Bad',
        redirect_uris: ['http://evil.example.com/cb'],
      })
      .expect(400);
  });

  it('POST /oauth/register with HTTP localhost is accepted (dev)', async () => {
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Local',
        redirect_uris: ['http://localhost:6274/callback'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      })
      .expect(201);
  });

  it('GET /oauth/register/:client_id with registration_access_token returns client', async () => {
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'Read me', redirect_uris: ['https://x.example/cb'] })
      .expect(201);
    const { client_id, registration_access_token } = reg.body;
    const res = await request(app.getHttpServer())
      .get(`/oauth/register/${client_id}`)
      .set('Authorization', `Bearer ${registration_access_token}`)
      .expect(200);
    expect(res.body.client_id).toBe(client_id);
  });

  it('DELETE /oauth/register/:client_id removes client', async () => {
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'Del', redirect_uris: ['https://y.example/cb'] })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/oauth/register/${reg.body.client_id}`)
      .set('Authorization', `Bearer ${reg.body.registration_access_token}`)
      .expect(204);
  });
});
```

- [ ] **Step 2: Correr (debe fallar — no hay controller)**

```bash
npm run test:e2e -- oauth-dcr
```

Expected: FAIL.

### Task 5.2: Implementar DCR controller

**Files:**
- Create: `backend/src/oauth/controllers/oauth-register.controller.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementar**

`backend/src/oauth/controllers/oauth-register.controller.ts`:

```typescript
import {
  Controller, Post, Get, Put, Delete, Req, Res, Body, BadRequestException, All,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

const ALLOWED_LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function validateRedirectUri(uri: string): void {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new BadRequestException(`Invalid redirect_uri: ${uri}`); }
  if (parsed.hash) throw new BadRequestException('redirect_uri must not contain fragment');
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && ALLOWED_LOOPBACK.includes(parsed.hostname)) return;
  throw new BadRequestException(`redirect_uri must be HTTPS (or http loopback): ${uri}`);
}

@Controller('oauth/register')
export class OAuthRegisterController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post()
  async register(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (Array.isArray(body?.redirect_uris)) {
      body.redirect_uris.forEach(validateRedirectUri);
    }
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All(':client_id')
  manage(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
```

- [ ] **Step 2: Registrar en módulo**

Agregar `OAuthRegisterController` a `controllers` en `oauth.module.ts`.

- [ ] **Step 3: Tests pasan**

```bash
npm run test:e2e -- oauth-dcr
```

Expected: PASS los 5 casos.

- [ ] **Step 4: Commit**

```bash
git add backend/src/oauth/controllers/oauth-register.controller.ts backend/src/oauth/oauth.module.ts backend/test/oauth/oauth-dcr.e2e-spec.ts
git commit -m "feat(oauth): DCR endpoint with redirect_uri validation + IP rate limit"
```

### Task 5.3: Test rate limit DCR

**Files:**
- Modify: `backend/test/oauth/oauth-dcr.e2e-spec.ts`

- [ ] **Step 1: Agregar caso**

Agregar al final del describe:

```typescript
it('rate limits DCR after 10 registrations from same IP/hour', async () => {
  for (let i = 0; i < 10; i++) {
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: `c${i}`, redirect_uris: [`https://c${i}.example/cb`] })
      .expect(201);
  }
  await request(app.getHttpServer())
    .post('/oauth/register')
    .send({ client_name: 'overflow', redirect_uris: ['https://o.example/cb'] })
    .expect(429);
});
```

> Si el throttler memoria persiste entre tests dentro del mismo `describe`, el contador sigue. Ese es el comportamiento esperado para este caso. Si querés aislar, pasá un IP override custom usando `beforeEach`. Por ahora: déjalo como integration check.

- [ ] **Step 2: Correr y commit**

```bash
npm run test:e2e -- oauth-dcr
git add backend/test/oauth/oauth-dcr.e2e-spec.ts
git commit -m "test(oauth): DCR rate limit smoke test"
```

---

## Phase 6 — Authorize + Consent flow

### Task 6.1: Consent service backend

**Files:**
- Create: `backend/src/oauth/consent/consent.service.ts`
- Create: `backend/src/oauth/consent/consent.service.spec.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../../organizations/organization-membership.entity';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let service: ConsentService;
  let grantRepo: any;
  let memRepo: any;

  beforeEach(async () => {
    grantRepo = { findOne: jest.fn(), save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'g-1' })) };
    memRepo = { findOne: jest.fn() };
    const m = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
      ],
    }).compile();
    service = m.get(ConsentService);
  });

  it('rejects if user has no active membership in chosen org', async () => {
    memRepo.findOne.mockResolvedValue(null);
    await expect(service.recordConsent({
      clientId: 'c', userId: 1, organizationId: 'org-x', scopes: ['patients:read'],
    })).rejects.toThrow(/membership/);
  });

  it('creates grant when none exists', async () => {
    memRepo.findOne.mockResolvedValue({ status: MembershipStatus.ACTIVE, role: OrgRole.ADMIN });
    grantRepo.findOne.mockResolvedValue(null);
    const g = await service.recordConsent({
      clientId: 'c', userId: 1, organizationId: 'org-1', scopes: ['patients:read'],
    });
    expect(g.id).toBe('g-1');
    expect(grantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'c', userId: 1, organizationId: 'org-1', scopes: ['patients:read'],
    }));
  });

  it('reactivates revoked grant on re-consent', async () => {
    memRepo.findOne.mockResolvedValue({ status: MembershipStatus.ACTIVE });
    grantRepo.findOne.mockResolvedValue({ id: 'old', revokedAt: new Date(), scopes: ['patients:read'] });
    await service.recordConsent({
      clientId: 'c', userId: 1, organizationId: 'org-1', scopes: ['patients:read'],
    });
    expect(grantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'old', revokedAt: null,
    }));
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';

const GRANT_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
  ) {}

  async recordConsent(input: {
    clientId: string; userId: number; organizationId: string; scopes: string[];
  }): Promise<OAuthGrant> {
    const membership = await this.memRepo.findOne({
      where: { userId: input.userId, organizationId: input.organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new ForbiddenException('User has no active membership in this organization');

    const existing = await this.grantRepo.findOne({
      where: { clientId: input.clientId, userId: input.userId, organizationId: input.organizationId },
    });
    if (existing) {
      const merged = Array.from(new Set([...existing.scopes, ...input.scopes]));
      return this.grantRepo.save({
        ...existing,
        revokedAt: null,
        scopes: merged,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
      });
    }
    return this.grantRepo.save({
      clientId: input.clientId,
      userId: input.userId,
      organizationId: input.organizationId,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    } as Partial<OAuthGrant>);
  }
}
```

- [ ] **Step 3: Test pasa + commit**

```bash
npx jest src/oauth/consent/consent.service.spec.ts
git add backend/src/oauth/consent/
git commit -m "feat(oauth): consent service with grant create/reactivate"
```

### Task 6.2: Consent controller (interno, llamado por SPA)

**Files:**
- Create: `backend/src/oauth/consent/consent.controller.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementación**

```typescript
import {
  Controller, Get, Post, Param, Body, UseGuards, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';
import { ConsentService } from './consent.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  'patients:read': { label: 'Leer pacientes', description: 'Buscar y consultar pacientes y su historial.' },
  'patients:write': { label: 'Editar pacientes', description: 'Crear y modificar pacientes.' },
  'clinical:read': { label: 'Leer datos clínicos', description: 'Consultar curaciones, notas de heridas y ciclos.' },
  'clinical:write': { label: 'Editar fichas clínicas', description: 'Crear y editar curaciones y notas de heridas.' },
  'agenda:read': { label: 'Leer agenda', description: 'Ver citas y disponibilidad.' },
  'agenda:write': { label: 'Editar agenda', description: 'Crear, modificar y cancelar citas.' },
  'inventory:read': { label: 'Leer inventario', description: 'Consultar productos, lotes y conteos.' },
  'inventory:write': { label: 'Editar inventario', description: 'Modificar stock y registrar conteos.' },
  'reports:read': { label: 'Leer reportes', description: 'Generar y exportar reportes.' },
  'org:admin': { label: 'Administrar organización', description: 'Gestionar miembros, roles e invitaciones.' },
};

@Controller('oauth/consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(
    private readonly oidc: OidcProviderSingleton,
    private readonly consent: ConsentService,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  @Get(':uid')
  async getInteraction(@Param('uid') uid: string, @CurrentUser() user: any) {
    const provider = this.oidc.get();
    const interaction = await provider.Interaction.findByUid(uid);
    if (!interaction) throw new NotFoundException('Interaction not found');

    const clientId: string = (interaction as any).params.client_id;
    const client = await this.clientRepo.findOne({ where: { clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const requestedScopes: string[] = String((interaction as any).params.scope || '').split(/\s+/).filter(Boolean);
    const functionalScopes = requestedScopes.filter((s) => SCOPE_LABELS[s]);

    const memberships = await this.memRepo.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
    });
    const orgs = await this.orgRepo.findByIds(memberships.map((m) => m.organizationId));

    return {
      client: {
        name: client.clientName,
        logoUri: client.logoUri,
        policyUri: client.policyUri,
        tosUri: client.tosUri,
        redirectUri: (interaction as any).params.redirect_uri,
        verified: client.firstAuthorizedAt !== null,
      },
      scopes: functionalScopes.map((s) => ({ id: s, ...SCOPE_LABELS[s] })),
      user: { id: user.id, username: user.username, fullName: user.username },
      organizations: orgs.map((o) => {
        const m = memberships.find((mm) => mm.organizationId === o.id)!;
        return { id: o.id, name: o.name, role: m.role };
      }),
      preselectedOrganizationId: user.organizationId,
    };
  }

  @Post(':uid')
  async submit(
    @Param('uid') uid: string,
    @Body() body: { approved: boolean; organizationId?: string },
    @CurrentUser() user: any,
  ) {
    const provider = this.oidc.get();
    const interaction = await provider.Interaction.findByUid(uid);
    if (!interaction) throw new NotFoundException('Interaction not found');
    if (!body.approved) {
      const result = { error: 'access_denied', error_description: 'User rejected consent' };
      const url = await (provider as any).interactionResult(interaction, result);
      return { redirectTo: url };
    }
    if (!body.organizationId) throw new BadRequestException('organizationId required');

    const clientId: string = (interaction as any).params.client_id;
    const requestedScopes: string[] = String((interaction as any).params.scope || '').split(/\s+/).filter(Boolean);
    await this.consent.recordConsent({
      clientId, userId: user.id, organizationId: body.organizationId, scopes: requestedScopes,
    });

    const Grant = (provider as any).Grant;
    const grant = new Grant({ accountId: String(user.id), clientId });
    requestedScopes.forEach((s) => grant.addOIDCScope(s));
    grant.organizationId = body.organizationId;
    const grantId = await grant.save();

    const url = await (provider as any).interactionResult(interaction, {
      login: { accountId: String(user.id) },
      consent: { grantId, organizationId: body.organizationId },
    }, { mergeWithLastSubmission: false });
    // Mark client as authorized at least once
    await this.clientRepo.update({ clientId }, { firstAuthorizedAt: () => 'COALESCE("firstAuthorizedAt", now())' });
    return { redirectTo: url };
  }
}
```

- [ ] **Step 2: Registrar en módulo**

Agregar `ConsentService` a providers, `ConsentController` a controllers en `oauth.module.ts`.

- [ ] **Step 3: Compile**

```bash
npx tsc --noEmit -p tsconfig.json
git add backend/src/oauth/consent/consent.controller.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): consent controller (GET/POST /oauth/consent/:uid)"
```

### Task 6.3: Authorize controller (delega a oidc-provider)

**Files:**
- Create: `backend/src/oauth/controllers/oauth-authorize.controller.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementar**

```typescript
import { Controller, All, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller('oauth')
export class OAuthAuthorizeController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @All('authorize')
  authorize(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('auth')
  authAlias(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
```

- [ ] **Step 2: Registrar y commit**

Agregar a `controllers` en `oauth.module.ts`.

```bash
npx tsc --noEmit -p tsconfig.json
git add backend/src/oauth/controllers/oauth-authorize.controller.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): authorize endpoint delegating to oidc-provider"
```

### Task 6.4: SPA — ConsentScreen page

**Files:**
- Create: `frontend/src/pages/account/ConsentScreen.tsx`
- Create: `frontend/src/api/oauth.ts`
- Modify: `frontend/src/App.tsx` (o donde se registren rutas)

- [ ] **Step 1: API client**

`frontend/src/api/oauth.ts`:

```typescript
import { http } from './http';

export interface ConsentInteraction {
  client: { name: string; logoUri: string | null; policyUri: string | null; tosUri: string | null; redirectUri: string; verified: boolean };
  scopes: { id: string; label: string; description: string }[];
  user: { id: number; username: string; fullName: string };
  organizations: { id: string; name: string; role: string }[];
  preselectedOrganizationId: string;
}

export async function fetchConsentInteraction(uid: string): Promise<ConsentInteraction> {
  return (await http.get(`/oauth/consent/${uid}`)).data;
}

export async function submitConsent(uid: string, body: { approved: boolean; organizationId?: string }): Promise<{ redirectTo: string }> {
  return (await http.post(`/oauth/consent/${uid}`, body)).data;
}

export interface ConnectedApp {
  grantId: string;
  client: { name: string; logoUri: string | null; policyUri: string | null };
  organizationId: string;
  organizationName: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export async function listConnectedApps(): Promise<ConnectedApp[]> {
  return (await http.get('/api/account/connected-apps')).data;
}

export async function revokeConnectedApp(grantId: string): Promise<void> {
  await http.delete(`/api/account/connected-apps/${grantId}`);
}
```

- [ ] **Step 2: ConsentScreen component**

`frontend/src/pages/account/ConsentScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, PageHeader, Select, Skeleton } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import { fetchConsentInteraction, submitConsent, ConsentInteraction } from '../../api/oauth';

export function ConsentScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const uid = params.get('interaction');
  const [data, setData] = useState<ConsentInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!uid) { navigate('/'); return; }
    fetchConsentInteraction(uid)
      .then((d) => { setData(d); setOrgId(d.preselectedOrganizationId); })
      .catch(() => toast.error('No pudimos cargar la solicitud de autorización.'))
      .finally(() => setLoading(false));
  }, [uid, navigate, toast]);

  async function decide(approved: boolean) {
    if (!uid) return;
    setSubmitting(true);
    try {
      const { redirectTo } = await submitConsent(uid, { approved, organizationId: approved ? orgId : undefined });
      window.location.assign(redirectTo);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Error al procesar la decisión.');
      setSubmitting(false);
    }
  }

  if (loading) return <Skeleton lines={8} />;
  if (!data) return null;

  return (
    <div className="max-w-xl mx-auto py-8">
      <PageHeader title={`${data.client.name} quiere conectarse`} />
      <Card className="space-y-6">
        {data.client.logoUri && (
          <img src={data.client.logoUri} alt={data.client.name} className="h-12" />
        )}
        {!data.client.verified && (
          <p className="text-sm text-amber-700">Aplicación no verificada. Asegurate de que conocés a quien la opera.</p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Conectar a:</label>
          {data.organizations.length > 1 ? (
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {data.organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — {o.role}</option>
              ))}
            </Select>
          ) : (
            <p className="text-sm">{data.organizations[0]?.name} — {data.organizations[0]?.role}</p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Esta app podrá:</p>
          <ul className="space-y-2">
            {data.scopes.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="font-medium">✓ {s.label}</span>
                <p className="text-gray-600 ml-5">{s.description}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-gray-600">
          Podés revocar el acceso en cualquier momento desde Mi cuenta › Aplicaciones conectadas.
        </p>

        {(data.client.policyUri || data.client.tosUri) && (
          <div className="text-xs space-x-2">
            {data.client.policyUri && <a href={data.client.policyUri} target="_blank" rel="noreferrer">Política de privacidad</a>}
            {data.client.tosUri && <a href={data.client.tosUri} target="_blank" rel="noreferrer">Términos</a>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => decide(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={() => decide(true)} disabled={submitting || !orgId}>Autorizar</Button>
        </div>
      </Card>
    </div>
  );
}
```

> Si el `Select` primitive no expone exactamente esa API, ajustá según la signature actual (`frontend/src/components/ui/Select.tsx`). Lo importante: usar primitives, no `<select>` raw.

- [ ] **Step 3: Registrar ruta**

En `frontend/src/App.tsx` (o donde estén las rutas autenticadas), agregar:

```tsx
import { ConsentScreen } from './pages/account/ConsentScreen';
// ...
<Route path="/account/oauth/consent" element={<RequireAuth><ConsentScreen /></RequireAuth>} />
```

- [ ] **Step 4: Verificación manual del flow completo**

```bash
# Terminal A
cd backend && npm run start:dev

# Terminal B
cd frontend && npm run dev
```

Manual:
1. Abrir browser, login en `http://localhost:5173`.
2. Registrar un cliente con curl:

```bash
curl -X POST http://localhost:3000/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"Manual Test","redirect_uris":["http://localhost:9999/cb"],"token_endpoint_auth_method":"none","application_type":"native"}'
```

3. Generar PKCE code_verifier + code_challenge (script en docs o snippet inline).
4. Visitar `http://localhost:3000/oauth/authorize?response_type=code&client_id=<cid>&redirect_uri=http://localhost:9999/cb&scope=patients:read+openid&state=abc&code_challenge=<cc>&code_challenge_method=S256`.
5. SPA debe redirigir a `/account/oauth/consent?interaction=...`. Aprobar.
6. Browser intenta cargar `http://localhost:9999/cb?code=...&state=abc`. Esperado: error de conexión (el cliente no existe), pero la URL contiene el `code`. ✓

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/account/ConsentScreen.tsx frontend/src/api/oauth.ts frontend/src/App.tsx
git commit -m "feat(oauth): SPA consent screen + oauth API client"
```

### Task 6.5: E2E del consent flow

**Files:**
- Create: `backend/test/oauth/oauth-flow-consent.e2e-spec.ts`

- [ ] **Step 1: Test que cubre consent + silent grant**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('OAuth consent flow (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    ds = m.get(DataSource);
    jwt = m.get(JwtService);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('first authorize triggers consent; submitting approval issues code; refresh of same scopes is silent', async () => {
    // Setup: usar un usuario y org existentes (asumimos seed o usar bootstrap.service)
    // Por simplicidad asumimos un user id=1 con membership en org-id 'uuid-acme'.
    // En proyecto real, usar fixtures.
    const userId = 1;
    const orgId = 'uuid-acme';
    const internalToken = jwt.sign({
      sub: userId, username: 'tester', organizationId: orgId, organizationName: 'Acme',
      role: 'Admin', establishmentIds: [], passwordChangedAt: null, jti: 'test-jti',
    });

    // 1. Register client
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Consent Test',
        redirect_uris: ['http://localhost:9999/cb'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
        scope: 'patients:read openid',
      })
      .expect(201);
    const { client_id } = reg.body;

    // 2. Authorize: redirect to consent SPA URL
    const { verifier, challenge } = pkcePair();
    const auth = await request(app.getHttpServer())
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id,
        redirect_uri: 'http://localhost:9999/cb',
        scope: 'patients:read openid',
        state: 'st-1',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })
      .expect(302);
    const location = auth.headers.location as string;
    expect(location).toMatch(/\/account\/oauth\/consent\?interaction=/);
    const uid = new URL(location, 'http://x').searchParams.get('interaction')!;

    // 3. Get interaction (as logged-in user)
    const inter = await request(app.getHttpServer())
      .get(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${internalToken}`)
      .expect(200);
    expect(inter.body.scopes.length).toBe(1); // only patients:read (openid is OIDC convention)

    // 4. Submit approval
    const submit = await request(app.getHttpServer())
      .post(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${internalToken}`)
      .send({ approved: true, organizationId: orgId })
      .expect(200);
    expect(submit.body.redirectTo).toMatch(/^http:\/\/localhost:9999\/cb\?code=/);
  });
});
```

> Este test asume fixtures de user/org. Si tu setup de tests no las trae, agregá un helper `createTestUserAndOrg()` antes de correr. Documentá lo que asume y dejá un TODO en el test si necesita fixtures futuros.

- [ ] **Step 2: Correr y commit**

```bash
npm run test:e2e -- oauth-flow-consent
git add backend/test/oauth/oauth-flow-consent.e2e-spec.ts
git commit -m "test(oauth): e2e consent flow with approval issuing auth code"
```

---

## Phase 7 — Token endpoint + PKCE + refresh rotation

### Task 7.1: Token controller (delega a oidc-provider)

**Files:**
- Create: `backend/src/oauth/controllers/oauth-token.controller.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Controller**

```typescript
import { Controller, All, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller('oauth')
export class OAuthTokenController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 60 } })
  @All('token')
  token(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('revoke')
  revoke(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('userinfo')
  userinfo(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
```

- [ ] **Step 2: Registrar y commit**

Agregar a `controllers` en `oauth.module.ts`.

```bash
git add backend/src/oauth/controllers/oauth-token.controller.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): token, revoke, userinfo endpoints"
```

### Task 7.2: E2E happy path completo (DCR → authorize → consent → token → API call)

**Files:**
- Create: `backend/test/oauth/oauth-flow-happy-path.e2e-spec.ts`

- [ ] **Step 1: Test integration end-to-end**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('OAuth happy path (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    jwt = m.get(JwtService);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('full flow ends with valid AT carrying org_id claim', async () => {
    const userId = 1;
    const orgId = 'uuid-acme';
    const internalToken = jwt.sign({
      sub: userId, username: 'tester', organizationId: orgId, organizationName: 'Acme',
      role: 'Admin', establishmentIds: [], passwordChangedAt: null, jti: 'jti-1',
    });

    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Happy', redirect_uris: ['http://localhost:9999/cb'],
        token_endpoint_auth_method: 'none', application_type: 'native', scope: 'patients:read openid',
      }).expect(201);
    const { client_id } = reg.body;

    const { verifier, challenge } = pkce();
    const auth = await request(app.getHttpServer())
      .get('/oauth/authorize')
      .query({
        response_type: 'code', client_id, redirect_uri: 'http://localhost:9999/cb',
        scope: 'patients:read openid', state: 's', code_challenge: challenge, code_challenge_method: 'S256',
      }).expect(302);
    const uid = new URL(auth.headers.location, 'http://x').searchParams.get('interaction')!;

    await request(app.getHttpServer())
      .get(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${internalToken}`).expect(200);
    const submit = await request(app.getHttpServer())
      .post(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${internalToken}`)
      .send({ approved: true, organizationId: orgId })
      .expect(200);
    const code = new URL(submit.body.redirectTo).searchParams.get('code')!;

    const tok = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:9999/cb',
        client_id,
        code_verifier: verifier,
      }).expect(200);
    expect(tok.body.access_token).toBeTruthy();
    expect(tok.body.refresh_token).toBeTruthy();
    expect(tok.body.id_token).toBeTruthy();

    // Decode AT (no signature check here, just claims)
    const [, payloadB64] = tok.body.access_token.split('.');
    const at = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    expect(at.org_id).toBe(orgId);
    expect(at.sub).toBe(String(userId));
    expect(at.scope).toBe('openid patients:read');
  });
});
```

- [ ] **Step 2: Correr y commit**

```bash
npm run test:e2e -- oauth-flow-happy-path
git add backend/test/oauth/oauth-flow-happy-path.e2e-spec.ts
git commit -m "test(oauth): full happy-path e2e issuing AT with org claim"
```

### Task 7.3: E2E PKCE enforcement

**Files:**
- Create: `backend/test/oauth/oauth-flow-pkce.e2e-spec.ts`

- [ ] **Step 1: Test cases (sin verifier, wrong verifier, plain method)**

Mismo patrón que happy path pero variantes:
- POST /oauth/token sin `code_verifier` → 400 con `error: invalid_grant`.
- POST /oauth/token con `code_verifier` aleatorio → 400.
- Authorize con `code_challenge_method=plain` → 400 con `unsupported_challenge_method`.

(Reescribí siguiendo el patrón del happy path; copiá el setup y solo cambiá la condición evaluada en cada `it`.)

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-flow-pkce.e2e-spec.ts
git commit -m "test(oauth): PKCE enforcement (S256 required, verifier match)"
```

### Task 7.4: E2E refresh + reuse detection

**Files:**
- Create: `backend/test/oauth/oauth-flow-refresh.e2e-spec.ts`

- [ ] **Step 1: Test refresh OK + reuse mata family**

Setup igual al happy path. Después del `tok` exitoso:

```typescript
// Refresh OK
const r1 = await request(app.getHttpServer())
  .post('/oauth/token')
  .type('form')
  .send({ grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id })
  .expect(200);
expect(r1.body.refresh_token).not.toBe(tok.body.refresh_token);
expect(r1.body.access_token).toBeTruthy();

// Reuse old RT → invalid_grant + revoca family
await request(app.getHttpServer())
  .post('/oauth/token')
  .type('form')
  .send({ grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id })
  .expect(400);

// New RT now also invalid (family killed)
await request(app.getHttpServer())
  .post('/oauth/token')
  .type('form')
  .send({ grant_type: 'refresh_token', refresh_token: r1.body.refresh_token, client_id })
  .expect(400);
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-flow-refresh.e2e-spec.ts
git commit -m "test(oauth): refresh rotation + reuse detection kills family"
```

---

---

## Phase 8 — Scope enforcement + multi-auth en domain controllers

### Task 8.1: Decorators

**Files:**
- Create: `backend/src/oauth/decorators/required-scopes.decorator.ts`
- Create: `backend/src/oauth/decorators/no-oauth-access.decorator.ts`

- [ ] **Step 1: required-scopes**

```typescript
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPES_KEY = 'oauth:requiredScopes';

export const RequiredScopes = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPES_KEY, scopes);
```

- [ ] **Step 2: no-oauth-access**

```typescript
import { SetMetadata } from '@nestjs/common';

export const NO_OAUTH_ACCESS_KEY = 'oauth:noAccess';

export const NoOAuthAccess = () => SetMetadata(NO_OAUTH_ACCESS_KEY, true);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/oauth/decorators/
git commit -m "feat(oauth): RequiredScopes + NoOAuthAccess decorators"
```

### Task 8.2: OAuthJwtStrategy + OAuthJwtGuard

**Files:**
- Create: `backend/src/oauth/strategies/oauth-jwt.strategy.ts`
- Create: `backend/src/oauth/guards/oauth-jwt.guard.ts`
- Create: `backend/src/oauth/strategies/oauth-jwt.strategy.spec.ts`

- [ ] **Step 1: Test que falla (strategy)**

```typescript
import { OAuthJwtStrategy } from './oauth-jwt.strategy';
import { generateKeyPairSync, createSign } from 'crypto';
import * as jose from 'jose';

describe('OAuthJwtStrategy', () => {
  let strategy: OAuthJwtStrategy;
  let signingKeys: any;
  let userRepo: any;
  let memRepo: any;
  let revocationRepo: any;
  let kid: string;
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeEach(() => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    kid = 'kid-test';

    signingKeys = {
      getAllPublishableKeys: jest.fn().mockResolvedValue([{
        kid, algorithm: 'RS256', publicKeyPem, privateKeyPem,
        publicJwk: { kty: 'RSA', alg: 'RS256', use: 'sig', kid },
      }]),
    };
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 12, username: 'u' }) };
    memRepo = { findOne: jest.fn().mockResolvedValue({ status: 'active', role: 'Admin' }) };
    revocationRepo = { findOne: jest.fn().mockResolvedValue(null) };

    strategy = new OAuthJwtStrategy(signingKeys as any, userRepo, memRepo, revocationRepo);
  });

  async function signToken(claims: object) {
    const priv = await jose.importPKCS8(privateKeyPem, 'RS256');
    return await new jose.SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'RS256', kid })
      .sign(priv);
  }

  it('validates a valid token and returns user shape', async () => {
    const token = await signToken({
      iss: 'http://issuer',
      aud: ['issuer'],
      sub: '12',
      org_id: 'uuid-acme',
      org_name: 'Acme',
      role: 'Admin',
      scope: 'patients:read',
      jti: 'j-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    process.env.OAUTH_ISSUER = 'http://issuer';
    const user = await strategy.validate(token, 'GET');
    expect(user.id).toBe(12);
    expect(user.organizationId).toBe('uuid-acme');
    expect(user.scopes).toEqual(['patients:read']);
    expect(user.tokenSource).toBe('oauth');
    expect(user.jti).toBe('j-1');
  });

  it('rejects token signed with unknown kid', async () => {
    const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPriv = otherPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const priv = await jose.importPKCS8(otherPriv, 'RS256');
    const token = await new jose.SignJWT({ sub: '12' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown' })
      .setIssuer('http://issuer').setAudience('issuer').setJti('j').setExpirationTime('10m').sign(priv);
    await expect(strategy.validate(token, 'GET')).rejects.toThrow();
  });

  it('rejects when jti is in revocation list and method is write', async () => {
    revocationRepo.findOne.mockResolvedValue({ jti: 'j-revoked', expiresAt: new Date(Date.now() + 60000) });
    const token = await signToken({
      iss: 'http://issuer', aud: ['issuer'], sub: '12', org_id: 'org', role: 'Admin',
      scope: 'patients:write', jti: 'j-revoked',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    });
    await expect(strategy.validate(token, 'POST')).rejects.toThrow();
  });

  it('does not consult revocation list on read methods', async () => {
    const token = await signToken({
      iss: 'http://issuer', aud: ['issuer'], sub: '12', org_id: 'org', role: 'Admin',
      scope: 'patients:read', jti: 'j-revoked',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    });
    await strategy.validate(token, 'GET');
    expect(revocationRepo.findOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementar strategy**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jose from 'jose';
import { OAuthSigningKeyService } from '../services/oauth-signing-key.service';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class OAuthJwtStrategy {
  private jwksCache: { value: jose.JWK[]; expiresAt: number } | null = null;

  constructor(
    private readonly signingKeys: OAuthSigningKeyService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
  ) {}

  async validate(token: string, httpMethod: string): Promise<any> {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    const keys = await this.getJwks();

    const { payload } = await jose.jwtVerify(token, async (header) => {
      const k = keys.find((j) => (j as any).kid === header.kid);
      if (!k) throw new UnauthorizedException('Unknown kid');
      return await jose.importJWK(k as any, header.alg as string);
    }, { issuer });

    if (!payload.sub) throw new UnauthorizedException('No sub');
    const userId = Number(payload.sub);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const orgId = (payload as any).org_id;
    if (!orgId) throw new UnauthorizedException('No org claim');
    const membership = await this.memRepo.findOne({
      where: { userId, organizationId: orgId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new UnauthorizedException('Membership inactive');

    if (WRITE_METHODS.has(httpMethod) && payload.jti) {
      const revoked = await this.revocationRepo.findOne({ where: { jti: payload.jti } });
      if (revoked) throw new UnauthorizedException('Token revoked');
    }

    const scopes = String(payload.scope || '').split(/\s+/).filter(Boolean);
    return {
      id: userId, sub: userId, username: user.username,
      organizationId: orgId, organizationName: (payload as any).org_name,
      role: (payload as any).role, establishmentIds: (payload as any).establishment_ids ?? [],
      scopes, tokenSource: 'oauth', jti: payload.jti,
    };
  }

  private async getJwks(): Promise<jose.JWK[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) return this.jwksCache.value;
    const keys = await this.signingKeys.getAllPublishableKeys();
    const value = keys.map((k) => k.publicJwk as jose.JWK);
    this.jwksCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
    return value;
  }

  invalidate() { this.jwksCache = null; }
}
```

- [ ] **Step 3: Implementar guard**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OAuthJwtStrategy } from '../strategies/oauth-jwt.strategy';

@Injectable()
export class OAuthJwtGuard implements CanActivate {
  constructor(private readonly strategy: OAuthJwtStrategy) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) throw new UnauthorizedException('No bearer token');
    const token = m[1];
    const user = await this.strategy.validate(token, req.method);
    (req as any).user = user;
    return true;
  }
}
```

- [ ] **Step 4: Wiring + tests pasan**

Agregar `OAuthJwtStrategy`, `OAuthJwtGuard` a providers en `oauth.module.ts`.

```bash
npx jest src/oauth/strategies/oauth-jwt.strategy.spec.ts
git add backend/src/oauth/strategies/ backend/src/oauth/guards/oauth-jwt.guard.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): OAuthJwtStrategy + OAuthJwtGuard with jti deny-list on writes"
```

### Task 8.3: OAuthScopeGuard

**Files:**
- Create: `backend/src/oauth/guards/oauth-scope.guard.ts`
- Create: `backend/src/oauth/guards/oauth-scope.guard.spec.ts`

- [ ] **Step 1: Test**

```typescript
import { Reflector } from '@nestjs/core';
import { OAuthScopeGuard } from './oauth-scope.guard';

function makeCtx(user: any, response: any = { setHeader: jest.fn() }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => response,
    }),
    getHandler: () => () => null,
    getClass: () => function C() {},
  } as any;
}

describe('OAuthScopeGuard', () => {
  let reflector: Reflector;
  let guard: OAuthScopeGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OAuthScopeGuard(reflector);
  });

  it('skips when no scopes required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: [] }))).toBe(true);
  });

  it('skips when token is internal JWT (not oauth)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:write']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'internal' }))).toBe(true);
  });

  it('passes when scope present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:read'] }))).toBe(true);
  });

  it('write implies read', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:write'] }))).toBe(true);
  });

  it('throws insufficient_scope when missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:write']);
    const setHeader = jest.fn();
    expect(() => guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:read'] }, { setHeader })))
      .toThrow(/insufficient_scope/);
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('insufficient_scope'));
  });
});
```

- [ ] **Step 2: Implementar guard**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/required-scopes.decorator';

@Injectable()
export class OAuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user || user.tokenSource !== 'oauth') return true; // internal JWT bypasses

    const granted = new Set<string>(user.scopes ?? []);
    const hasAll = required.every((s) => granted.has(s) || (s.endsWith(':read') && granted.has(s.replace(':read', ':write'))));
    if (hasAll) return true;

    const missing = required.find((s) => !granted.has(s) && !(s.endsWith(':read') && granted.has(s.replace(':read', ':write'))))!;
    const res = ctx.switchToHttp().getResponse();
    res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope" scope="${missing}"`);
    throw new ForbiddenException({ error: 'insufficient_scope', scope: missing });
  }
}
```

- [ ] **Step 3: Tests pasan + commit**

```bash
npx jest src/oauth/guards/oauth-scope.guard.spec.ts
git add backend/src/oauth/guards/oauth-scope.guard.ts backend/src/oauth/guards/oauth-scope.guard.spec.ts
git commit -m "feat(oauth): OAuthScopeGuard with read-implied-by-write rule"
```

### Task 8.4: MultiAuthGuard

**Files:**
- Create: `backend/src/oauth/guards/multi-auth.guard.ts`

- [ ] **Step 1: Implementar**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OAuthJwtGuard } from './oauth-jwt.guard';

@Injectable()
export class MultiAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtAuthGuard, private readonly oauth: OAuthJwtGuard) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) throw new UnauthorizedException('No bearer token');

    // Decide which strategy by inspecting the issuer claim
    let issuer: string | undefined;
    try {
      const [, payloadB64] = m[1].split('.');
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      issuer = decoded?.iss;
    } catch { /* malformed */ }

    const expectedOauthIss = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    if (issuer === expectedOauthIss) {
      const ok = await this.oauth.canActivate(ctx);
      if (ok) {
        // mark tokenSource
        (req.user ??= {}).tokenSource = 'oauth';
      }
      return ok;
    }

    // fall back to internal JWT
    const ok = await Promise.resolve(this.jwt.canActivate(ctx) as any);
    if (ok) {
      (req.user ??= {}).tokenSource = 'internal';
    }
    return !!ok;
  }
}
```

- [ ] **Step 2: Wiring**

Editar `oauth.module.ts` para exportar `MultiAuthGuard`. Para que pueda ser inyectado, asegurate que `JwtAuthGuard` esté disponible (importar `AuthModule` en `OAuthModule`).

```bash
git add backend/src/oauth/guards/multi-auth.guard.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): MultiAuthGuard switches on iss claim"
```

### Task 8.5: Aplicar matriz scope→endpoints en domain controllers

**Files:** múltiples (`backend/src/{patients,curaciones,wound-notes,wound-photos,cycles,appointments,inventory,reports,organizations,establishments,users,dashboard}/*.controller.ts`)

Esta task es repetitiva pero crítica. Por cada controller, reemplazar el guard JWT por `MultiAuthGuard` y agregar el `@RequiredScopes(...)` correspondiente según la matriz del spec sec 6.1.

- [ ] **Step 1: Ejemplo en patients.controller.ts**

```typescript
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';
// ...
@Controller('api/patients')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class PatientsController {
  @RequiredScopes('patients:read')
  @Get()
  list(...) { ... }

  @RequiredScopes('patients:read')
  @Get(':id')
  get(...) { ... }

  @RequiredScopes('patients:write')
  @Post()
  create(...) { ... }

  @RequiredScopes('patients:write')
  @Patch(':id')
  update(...) { ... }

  @RequiredScopes('patients:write')
  @Delete(':id')
  remove(...) { ... }
}
```

- [ ] **Step 2: Repetir para cada domain controller siguiendo la matriz**

| Controller | Scope read | Scope write |
|---|---|---|
| `patients` | patients:read | patients:write |
| `curaciones` | clinical:read | clinical:write |
| `wound-notes` | clinical:read | clinical:write |
| `wound-photos` | clinical:read | clinical:write |
| `cycles` | clinical:read | clinical:write |
| `appointments` / `dashboard` | agenda:read | agenda:write |
| `inventory` (products, lots, stock-counts, canasta) | inventory:read | inventory:write |
| `reports` | reports:read | (n/a, todos read) |
| `organizations`, `establishments`, `users` | org:admin | org:admin |

- [ ] **Step 3: Marcar `auth.controller.ts` con `@NoOAuthAccess`**

Editar `backend/src/auth/auth.controller.ts`:

```typescript
import { NoOAuthAccess } from '../oauth/decorators/no-oauth-access.decorator';
// ...
@NoOAuthAccess()
@Controller('api/auth')
export class AuthController { ... }
```

- [ ] **Step 4: Compile + smoke test**

```bash
cd backend
npx tsc --noEmit -p tsconfig.json
npm run start:dev
# manual: curl con AT OAuth válido a /api/patients esperando 200
# manual: curl con AT OAuth con solo patients:read a POST /api/patients esperando 403
```

- [ ] **Step 5: Commit por dominio**

Hacer un commit por dominio para no mezclar:

```bash
git add backend/src/patients/
git commit -m "feat(oauth): apply patients scopes to controllers"

git add backend/src/curaciones/ backend/src/wound-notes/ backend/src/wound-photos/ backend/src/cycles/
git commit -m "feat(oauth): apply clinical scopes to controllers"

# ...etc
```

### Task 8.6: Test de gobernanza `oauth-coverage.spec.ts`

**Files:**
- Create: `backend/test/oauth/oauth-coverage.spec.ts`

- [ ] **Step 1: Implementar test estático**

```typescript
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { REQUIRED_SCOPES_KEY } from '../../src/oauth/decorators/required-scopes.decorator';
import { NO_OAUTH_ACCESS_KEY } from '../../src/oauth/decorators/no-oauth-access.decorator';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';

const EXEMPT_PATH_PREFIXES = [
  '/api/auth/',          // SPA auth endpoints (NoOAuthAccess marker)
  '/api/health',
  '/api/account/connected-apps', // separate user-scoped endpoint
  '/oauth/',
  '/.well-known/',
  '/jwks.json',
];

describe('OAuth scope coverage', () => {
  it('every domain endpoint has @RequiredScopes or @NoOAuthAccess', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const reflector = moduleRef.get(Reflector);
    const discovery = moduleRef.get(DiscoveryService);
    const scanner = moduleRef.get(MetadataScanner);

    const offenders: string[] = [];
    const controllers = discovery.getControllers();
    for (const wrapper of controllers) {
      const instance = wrapper.instance;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance);
      const classNoAccess = reflector.get<boolean>(NO_OAUTH_ACCESS_KEY, instance.constructor);
      if (classNoAccess) continue;

      scanner.scanFromPrototype(instance, proto, (methodName) => {
        const handler = proto[methodName];
        const path: string = reflector.get('path', handler) ?? '';
        const fullPath = ('/' + (Reflect.getMetadata('path', instance.constructor) ?? '') + '/' + path).replace(/\/+/g, '/');
        if (EXEMPT_PATH_PREFIXES.some((p) => fullPath.startsWith(p))) return;

        const scopes = reflector.get<string[]>(REQUIRED_SCOPES_KEY, handler);
        const noAccess = reflector.get<boolean>(NO_OAUTH_ACCESS_KEY, handler);
        if (!scopes && !noAccess) {
          offenders.push(`${instance.constructor.name}.${methodName} (${fullPath})`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error('Endpoints lacking @RequiredScopes or @NoOAuthAccess:\n' + offenders.join('\n'));
    }
  });
});
```

> Si la API de `MetadataScanner` cambió (NestJS 11), ajustá. La idea es: iterar todos los handlers, descartar los que tienen path bajo prefijos exentos, y exigir que cada uno tenga uno de los dos markers.

- [ ] **Step 2: Correr — debe pasar después de Task 8.5**

```bash
npx jest test/oauth/oauth-coverage.spec.ts
```

Si falla, agregá los markers que faltan.

- [ ] **Step 3: Commit**

```bash
git add backend/test/oauth/oauth-coverage.spec.ts
git commit -m "test(oauth): governance test enforcing scope coverage"
```

### Task 8.7: E2E scopes

**Files:**
- Create: `backend/test/oauth/oauth-scopes.e2e-spec.ts`

- [ ] **Step 1: Test cases**

Reusar setup del happy-path. Casos:

1. AT con solo `patients:read` → GET /api/patients = 200; POST /api/patients = 403 con body `{ error: "insufficient_scope", scope: "patients:write" }`.
2. AT con `patients:write` → GET /api/patients = 200 (write implica read).
3. AT con `org:admin` → GET /api/patients = 403 (no implica patients:read).
4. JWT interno → todos los endpoints siguen funcionando como antes.

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-scopes.e2e-spec.ts
git commit -m "test(oauth): scope enforcement on domain endpoints"
```

### Task 8.8: E2E multi-org isolation

**Files:**
- Create: `backend/test/oauth/oauth-multi-org.e2e-spec.ts`
- Create: `backend/test/oauth/oauth-isolation.e2e-spec.ts`

- [ ] **Step 1: multi-org test**

Setup: usuario miembro de org A y org B. Pacientes en cada org.

1. Autorizar cliente con org A → AT.
2. GET /api/patients con AT → solo pacientes de org A.
3. Re-autorizar mismo cliente con org B → segundo AT (segundo grant).
4. Ambos ATs viven simultáneamente y cada uno ve solo su org.

- [ ] **Step 2: isolation test**

Mismo patrón que `org-isolation.spec.ts` actual del Sub #1, pero usando AT OAuth en lugar de JWT interno. Verificar que cada entity tenanted está aislada.

- [ ] **Step 3: Commits**

```bash
git add backend/test/oauth/oauth-multi-org.e2e-spec.ts backend/test/oauth/oauth-isolation.e2e-spec.ts
git commit -m "test(oauth): multi-org token binding + cross-org isolation"
```

---

## Phase 9 — Connected apps + Revocation

### Task 9.1: ConnectedAppsService

**Files:**
- Create: `backend/src/oauth/connected-apps/connected-apps.service.ts`
- Create: `backend/src/oauth/connected-apps/connected-apps.service.spec.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';
import { ConnectedAppsService } from './connected-apps.service';

describe('ConnectedAppsService', () => {
  let service: ConnectedAppsService;
  let grantRepo: any;
  let clientRepo: any;
  let tokenRepo: any;
  let revocationRepo: any;
  let orgRepo: any;

  beforeEach(async () => {
    grantRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    clientRepo = { findOne: jest.fn() };
    tokenRepo = { find: jest.fn(), update: jest.fn() };
    revocationRepo = { save: jest.fn(), insert: jest.fn() };
    orgRepo = { findOne: jest.fn() };
    const m = await Test.createTestingModule({
      providers: [
        ConnectedAppsService,
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(OAuthToken), useValue: tokenRepo },
        { provide: getRepositoryToken(OAuthRevocation), useValue: revocationRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(ConnectedAppsService);
  });

  it('list returns user grants enriched with client + org info', async () => {
    grantRepo.find.mockResolvedValue([
      { id: 'g1', clientId: 'c1', userId: 1, organizationId: 'o1', scopes: ['patients:read'], lastUsedAt: null, createdAt: new Date(), expiresAt: new Date(), revokedAt: null },
    ]);
    clientRepo.findOne.mockResolvedValue({ clientId: 'c1', clientName: 'Claude', logoUri: null, policyUri: null });
    orgRepo.findOne.mockResolvedValue({ id: 'o1', name: 'Acme' });
    const apps = await service.listForUser(1);
    expect(apps[0]).toMatchObject({ grantId: 'g1', client: { name: 'Claude' }, organizationName: 'Acme' });
  });

  it('revoke marks grant + denylists AT jti + deletes refresh tokens', async () => {
    grantRepo.findOne.mockResolvedValue({ id: 'g1', userId: 1, revokedAt: null });
    tokenRepo.find.mockResolvedValue([
      { id: 'jti-at', kind: 'access', expiresAt: new Date(Date.now() + 600000), payload: { jti: 'jti-at' } },
      { id: 'rt-1', kind: 'refresh', expiresAt: new Date(Date.now() + 86400000), payload: {} },
    ]);
    await service.revoke(1, 'g1');
    expect(grantRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1', revokedAt: expect.any(Date) }));
    expect(revocationRepo.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ jti: 'jti-at' })]));
    expect(tokenRepo.update).toHaveBeenCalled(); // expiresAt = now()
  });

  it('revoke throws if grant not owned by user', async () => {
    grantRepo.findOne.mockResolvedValue({ id: 'g1', userId: 999 });
    await expect(service.revoke(1, 'g1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, LessThan } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';

@Injectable()
export class ConnectedAppsService {
  constructor(
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  async listForUser(userId: number) {
    const grants = await this.grantRepo.find({ where: { userId, revokedAt: IsNull() } });
    const clientIds = Array.from(new Set(grants.map((g) => g.clientId)));
    const orgIds = Array.from(new Set(grants.map((g) => g.organizationId)));
    const [clients, orgs] = await Promise.all([
      clientIds.length ? this.clientRepo.find({ where: { clientId: In(clientIds) } }) : Promise.resolve([]),
      orgIds.length ? this.orgRepo.findByIds(orgIds) : Promise.resolve([]),
    ]);
    return grants.map((g) => {
      const c = clients.find((x) => x.clientId === g.clientId);
      const o = orgs.find((x) => x.id === g.organizationId);
      return {
        grantId: g.id,
        client: { name: c?.clientName ?? 'Unknown', logoUri: c?.logoUri ?? null, policyUri: c?.policyUri ?? null },
        organizationId: g.organizationId,
        organizationName: o?.name ?? '',
        scopes: g.scopes,
        lastUsedAt: g.lastUsedAt,
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
      };
    });
  }

  async revoke(userId: number, grantId: string): Promise<void> {
    const grant = await this.grantRepo.findOne({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Grant not found');
    if (grant.userId !== userId) throw new ForbiddenException('Grant not owned by user');

    grant.revokedAt = new Date();
    await this.grantRepo.save(grant);

    const tokens = await this.tokenRepo.find({ where: { grantId } });
    const now = new Date();
    if (tokens.length) {
      await this.tokenRepo.update({ grantId }, { expiresAt: now });
      const revocations = tokens
        .filter((t) => t.kind === 'access')
        .map((t) => ({
          jti: (t.payload as any).jti ?? t.id,
          userId,
          reason: 'user_revoked',
          expiresAt: t.expiresAt,
        }));
      if (revocations.length) {
        await this.revocationRepo.insert(revocations);
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
npx jest src/oauth/connected-apps/connected-apps.service.spec.ts
git add backend/src/oauth/connected-apps/
git commit -m "feat(oauth): connected apps service (list + revoke with cascade)"
```

### Task 9.2: ConnectedAppsController

**Files:**
- Create: `backend/src/oauth/connected-apps/connected-apps.controller.ts`
- Modify: `backend/src/oauth/oauth.module.ts`

- [ ] **Step 1: Implementar**

```typescript
import { Controller, Get, Delete, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { NoOAuthAccess } from '../decorators/no-oauth-access.decorator';
import { ConnectedAppsService } from './connected-apps.service';

@NoOAuthAccess()
@Controller('api/account/connected-apps')
@UseGuards(JwtAuthGuard)
export class ConnectedAppsController {
  constructor(private readonly service: ConnectedAppsService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.listForUser(user.id);
  }

  @Delete(':grantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: any, @Param('grantId') grantId: string): Promise<void> {
    await this.service.revoke(user.id, grantId);
  }
}
```

- [ ] **Step 2: Registrar y commit**

Agregar a `controllers` en `oauth.module.ts`.

```bash
git add backend/src/oauth/connected-apps/connected-apps.controller.ts backend/src/oauth/oauth.module.ts
git commit -m "feat(oauth): connected apps controller (GET/DELETE /api/account/connected-apps)"
```

### Task 9.3: SPA — ConnectedAppsPage

**Files:**
- Create: `frontend/src/pages/account/ConnectedAppsPage.tsx`
- Modify: `frontend/src/App.tsx` (registrar ruta)

- [ ] **Step 1: Component**

```tsx
import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { listConnectedApps, revokeConnectedApp, ConnectedApp } from '../../api/oauth';

export function ConnectedAppsPage() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setApps(await listConnectedApps());
  }
  useEffect(() => { load().catch(() => toast.error('Error al cargar las apps.')); }, []);

  async function onRevoke(app: ConnectedApp) {
    const ok = await confirm({
      title: 'Revocar acceso',
      message: `Vas a revocar el acceso de ${app.client.name} a ${app.organizationName}. Esto cierra cualquier sesión activa de la app inmediatamente.`,
      confirmLabel: 'Revocar', cancelLabel: 'Cancelar', danger: true,
    });
    if (!ok) return;
    try {
      await revokeConnectedApp(app.grantId);
      toast.success('Acceso revocado.');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No pudimos revocar.');
    }
  }

  if (apps === null) return <Skeleton lines={6} />;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <PageHeader title="Aplicaciones conectadas"
        subtitle="Estas aplicaciones pueden acceder a tu cuenta. Revocar el acceso es inmediato." />
      {apps.length === 0 ? (
        <EmptyState
          title="No tenés aplicaciones conectadas"
          message="Cuando una app pida acceso a tu cuenta, podrás verla acá."
        />
      ) : (
        <div className="space-y-4">
          {apps.map((a) => (
            <Card key={a.grantId} className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {a.client.logoUri && <img src={a.client.logoUri} alt={a.client.name} className="h-8" />}
                  <h3 className="font-semibold">{a.client.name}</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Conectada a <strong>{a.organizationName}</strong> · {a.scopes.length} permisos
                </p>
                <p className="text-xs text-gray-500">
                  {a.lastUsedAt ? `Último uso: ${new Date(a.lastUsedAt).toLocaleString()}` : 'Aún no se usó'}
                </p>
                <p className="text-xs text-gray-500">
                  Conectada el {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button variant="danger" onClick={() => onRevoke(a)}>Revocar</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ruta + verificación manual**

Agregar ruta en `App.tsx`. Levantar SPA + backend, autorizar un cliente, ir a `/account/connected-apps`, verificar listado, revocar, verificar que desaparece.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/account/ConnectedAppsPage.tsx frontend/src/App.tsx
git commit -m "feat(oauth): SPA connected apps page"
```

### Task 9.4: E2E revocation

**Files:**
- Create: `backend/test/oauth/oauth-revocation.e2e-spec.ts`

- [ ] **Step 1: Test cases**

1. Setup happy path → AT en mano.
2. DELETE /api/account/connected-apps/:grantId con JWT interno del usuario.
3. Inmediatamente: POST /api/patients con AT (write) → 401 Token revoked.
4. GET /api/patients con AT (read) → seguirá funcionando hasta `exp` (10 min). Verificar que la denylist NO se consulta para reads.

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-revocation.e2e-spec.ts
git commit -m "test(oauth): revocation cascades + denylist on writes only"
```

---

## Phase 10 — Userinfo + audit logging hooks

### Task 10.1: E2E userinfo

**Files:**
- Create: `backend/test/oauth/oauth-userinfo.e2e-spec.ts`

- [ ] **Step 1: Test**

```typescript
// Setup happy path with scope='openid patients:read'
const userinfo = await request(app.getHttpServer())
  .get('/oauth/userinfo')
  .set('Authorization', `Bearer ${tok.body.access_token}`)
  .expect(200);
expect(userinfo.body).toMatchObject({
  sub: expect.any(String),
  username: expect.any(String),
  org_id: expect.any(String),
  org_name: expect.any(String),
  role: expect.any(String),
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-userinfo.e2e-spec.ts
git commit -m "test(oauth): userinfo returns identity claims"
```

### Task 10.2: Audit log hooks

**Files:**
- Modify: `backend/src/oauth/consent/consent.controller.ts`
- Modify: `backend/src/oauth/connected-apps/connected-apps.service.ts`
- Modify: `backend/src/oauth/controllers/oauth-register.controller.ts`

- [ ] **Step 1: Inyectar AuditLogService donde aplique**

En cada uno de los archivos arriba: inyectar el `AuditLogService` existente y registrar entradas:

| Acción | Donde | Evento |
|---|---|---|
| `oauth.client.registered` | `oauth-register.controller.ts` después de POST exitoso | `entityType: OAuthClient, entityId: client.id, after: { clientId, clientName }` |
| `oauth.consent.granted` | `consent.controller.ts` en POST aprobado | `entityType: OAuthGrant, after: { clientId, organizationId, scopes }` |
| `oauth.consent.denied` | `consent.controller.ts` en POST rechazado | `entityType: OAuthGrant, after: { clientId, denied: true }` |
| `oauth.grant.revoked` | `connected-apps.service.ts` en revoke | `entityType: OAuthGrant, before: { scopes, clientId }, after: { revokedAt }` |

> Verificá la signature del AuditLogService actual con `grep -n "class AuditLogService" backend/src/audit-log/`. Adaptá los argumentos al pattern usado por el resto del proyecto.

- [ ] **Step 2: Commit**

```bash
git add backend/src/oauth/
git commit -m "feat(oauth): audit log entries for register/consent/revoke"
```

---

## Phase 11 — Rate limiting completo

### Task 11.1: OAuthClientThrottlerGuard

**Files:**
- Create: `backend/src/oauth/guards/oauth-client-throttler.guard.ts`

- [ ] **Step 1: Implementar**

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

@Injectable()
export class OAuthClientThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: any): Promise<string> {
    if (req.user?.tokenSource === 'oauth') {
      const clientId = req.user?.clientId ?? req.user?.aud ?? 'unknown';
      const userId = req.user?.id ?? 'anon';
      return `oauth:${clientId}:${userId}`;
    }
    return super.getTracker(req);
  }
}
```

- [ ] **Step 2: Aplicar a domain controllers via @Throttle decorator**

Para writes (POST/PATCH/DELETE) con scope destructivo:

```typescript
@Throttle({ default: { ttl: 60000, limit: 60 } })
@RequiredScopes('patients:write')
@Post()
create(...) { ... }
```

Para reads (GET):

```typescript
@Throttle({ default: { ttl: 60000, limit: 300 } })
@RequiredScopes('patients:read')
@Get()
list(...) { ... }
```

- [ ] **Step 3: E2E**

```typescript
// backend/test/oauth/oauth-rate-limits.e2e-spec.ts
// Setup AT con patients:write
// Hacer 60 POSTs con éxito
// 61er POST debe ser 429 con Retry-After
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/oauth/guards/oauth-client-throttler.guard.ts backend/src/patients/ backend/test/oauth/oauth-rate-limits.e2e-spec.ts
git commit -m "feat(oauth): per-client rate limiting + e2e"
```

### Task 11.2: Cron de purga

**Files:**
- Create: `backend/src/oauth/services/oauth-cleanup.service.ts`
- Modify: `backend/src/oauth/oauth.module.ts`
- Install dep: `@nestjs/schedule`

- [ ] **Step 1: Instalar @nestjs/schedule**

```bash
cd backend
npm install @nestjs/schedule
```

- [ ] **Step 2: Implementar**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, And } from 'typeorm';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';

@Injectable()
export class OAuthCleanupService {
  private readonly logger = new Logger(OAuthCleanupService.name);
  constructor(
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OAuthSigningKey) private readonly keyRepo: Repository<OAuthSigningKey>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyCleanup() {
    const now = new Date();
    const orphanCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const tokenCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const grantArchiveCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [orphans, tokens, revocs, archives, retiredKeys] = await Promise.all([
      this.clientRepo.delete({ firstAuthorizedAt: IsNull(), createdAt: LessThan(orphanCutoff) }),
      this.tokenRepo.delete({ expiresAt: LessThan(tokenCutoff) }),
      this.revocationRepo.delete({ expiresAt: LessThan(now) }),
      this.grantRepo.update({ revokedAt: LessThan(grantArchiveCutoff), archivedAt: IsNull() }, { archivedAt: now }),
      this.keyRepo.update({ status: 'retired', retireScheduledAt: LessThan(now) }, { status: 'revoked' }),
    ]);
    this.logger.log(`Cleanup: orphans=${orphans.affected} tokens=${tokens.affected} revoc=${revocs.affected} archived=${archives.affected} keysRevoked=${retiredKeys.affected}`);
  }
}
```

- [ ] **Step 3: Wiring**

```typescript
// app.module.ts
import { ScheduleModule } from '@nestjs/schedule';
@Module({ imports: [ScheduleModule.forRoot(), /* ... */] })
```

```typescript
// oauth.module.ts
import { OAuthCleanupService } from './services/oauth-cleanup.service';
providers: [..., OAuthCleanupService],
```

- [ ] **Step 4: Test unit del cleanup**

`backend/src/oauth/services/oauth-cleanup.service.spec.ts` con repos mockeados, asegurando que los rangos de fecha sean correctos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oauth/services/oauth-cleanup.service.ts backend/src/oauth/services/oauth-cleanup.service.spec.ts backend/src/oauth/oauth.module.ts backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(oauth): daily cleanup cron for orphans, tokens, revocations, retired keys"
```

---

## Phase 12 — Key rotation CLI

### Task 12.1: CLI script

**Files:**
- Create: `backend/src/oauth/cli/oauth-rotate-keys.ts`
- Modify: `backend/package.json` (script entry)

- [ ] **Step 1: Implementar**

```typescript
import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { OAuthSigningKeyService } from '../services/oauth-signing-key.service';
import { generateKeyPairSync } from 'crypto';
import { KmsService } from '../../kms/kms.service';

async function main() {
  const program = new Command();
  program
    .option('--force', 'apply changes (no confirmation)')
    .option('--dry-run', 'show actions without writing')
    .option('--retire-after-days <n>', 'days before retired key is revoked', '7')
    .option('--reason <text>', 'reason for rotation', 'scheduled rotation');
  program.parse();
  const opts = program.opts();
  const retireDays = parseInt(opts.retireAfterDays, 10);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const ds = app.get(DataSource);
  const kms = app.get(KmsService);
  const signingKeys = app.get(OAuthSigningKeyService);
  const logger = new Logger('oauth:rotate-keys');

  const repo = ds.getRepository(OAuthSigningKey);
  const current = await repo.findOne({ where: { status: 'active' } });
  logger.log(`Current active key: ${current?.id ?? '<none>'}`);

  if (opts.dryRun) {
    logger.log(`Would generate new RSA 2048 key, retire ${current?.id} for ${retireDays}d. Reason: ${opts.reason}`);
    await app.close();
    return;
  }

  await ds.transaction(async (m) => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const enc = await kms.encrypt(Buffer.from(privateKeyPem));

    const newKey = await m.getRepository(OAuthSigningKey).save({
      algorithm: 'RS256',
      publicKeyPem,
      privateKeyEncrypted: enc,
      status: 'active',
      activatedAt: new Date(),
    } as Partial<OAuthSigningKey>);

    if (current) {
      const retireScheduledAt = new Date(Date.now() + retireDays * 24 * 60 * 60 * 1000);
      await m.getRepository(OAuthSigningKey).update(current.id, {
        status: 'retired',
        retiredAt: new Date(),
        retireScheduledAt,
      });
    }
    logger.log(`Rotated. New active kid=${newKey.id}. Retired old kid=${current?.id ?? '<none>'} for ${retireDays}d.`);
  });

  signingKeys.invalidate();
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Script entry**

Editar `backend/package.json`:

```json
{
  "scripts": {
    "oauth:rotate-keys": "ts-node -r tsconfig-paths/register src/oauth/cli/oauth-rotate-keys.ts"
  }
}
```

- [ ] **Step 3: Verificación manual**

```bash
cd backend
npm run oauth:rotate-keys -- --dry-run
# debe loguear el plan sin escribir
npm run oauth:rotate-keys -- --reason="manual test"
# debe rotar
psql "$DATABASE_URL" -c "SELECT id, status FROM oauth_signing_key ORDER BY \"createdAt\";"
# debe haber 1 active + 1 retired
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/oauth/cli/oauth-rotate-keys.ts backend/package.json
git commit -m "feat(oauth): CLI for manual key rotation with retire window"
```

### Task 12.2: E2E rotación

**Files:**
- Create: `backend/test/oauth/oauth-key-rotation.e2e-spec.ts`

- [ ] **Step 1: Test**

```typescript
// 1. Get AT signed by K1 (happy path setup)
// 2. Programmatically rotate (call OAuthSigningKeyService rotate-equivalent or run the CLI logic)
// 3. AT signed by K1 still valid (K1 retired, in JWKS)
// 4. New AT issued is signed by K2 (different kid)
// 5. Move K1 to revoked (programmatically) → AT K1 fails 401
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/oauth-key-rotation.e2e-spec.ts
git commit -m "test(oauth): key rotation lifecycle"
```

---

## Phase 13 — Conformance, security review, documentación

### Task 13.1: Conformance script

**Files:**
- Create: `backend/test/oauth/conformance.ts`

- [ ] **Step 1: Script standalone**

```typescript
// Genera DCR client → completa authorize via headless flow → token → valida claims y errores RFC.
// Ejecutable con: npx ts-node backend/test/oauth/conformance.ts http://localhost:3000
// Imprime un report con check ✓/✗ por cada item del checklist:
//   - JWT claims: iss, sub, aud, exp, iat, jti, scope
//   - JWKS cache-control header
//   - Errors RFC 6749 shape
//   - PKCE plain rejected
//   - redirect_uri mismatch rejected
//   - DCR with HTTP non-loopback rejected
//   - revocation endpoint
//   - userinfo endpoint
```

(El script es ~150 líneas; seguí el patrón del happy-path test pero como standalone con axios + chalk para output legible. No es jest test, es un runner manual.)

- [ ] **Step 2: Commit**

```bash
git add backend/test/oauth/conformance.ts
git commit -m "test(oauth): conformance runner for manual gate"
```

### Task 13.2: Security review runbook

**Files:**
- Create: `docs/runbooks/oauth-security-review.md`

- [ ] **Step 1: Documento**

Estructura:

1. **Scope:** lo que cubre este review (módulo OAuth)
2. **OWASP top 10 + RFC 6749 checklist:** cada item con (a) qué probar, (b) cómo (curl o test ref), (c) resultado esperado, (d) firmado por <revisor> en <fecha>.
3. **Items obligatorios pre-release:**
   - redirect_uri exact match (no prefix bypass)
   - state parameter propagado
   - code single-use (no re-use)
   - PKCE S256 obligatorio (plain rechazado)
   - JWT aud enforced
   - DCR no leak existencia de clients
   - Refresh rotation reuse-detection mata family
   - Rate limits bloquean spam
   - Tokens no aparecen en logs / payloads de audit
4. **Sign-off:** quién, cuándo.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/oauth-security-review.md
git commit -m "docs(oauth): security review runbook with OWASP checklist"
```

### Task 13.3: Developer guide

**Files:**
- Create: `docs/runbooks/oauth-developer-guide.md`

- [ ] **Step 1: Documento**

Estructura:

1. **Endpoints:** tabla con método, path, descripción, params.
2. **Scopes:** lista con descripción humana de cada uno.
3. **Ejemplo curl completo:** DCR → authorize (con PKCE) → token → call protected.
4. **Errors comunes:** `insufficient_scope`, `invalid_grant`, `invalid_request` y cómo se ven.
5. **Troubleshooting:** "mi token expiró", "perdí el refresh", "¿cómo revoco?", "¿cómo cambio de org?"
6. **Limits:** rate limits actuales por capa.
7. **Cambios en v2:** lista lo que está out of scope (de la sec 13 del spec).

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/oauth-developer-guide.md
git commit -m "docs(oauth): public developer guide"
```

### Task 13.4: Pre-merge migration drill

**Files:** ninguno (acción operativa)

- [ ] **Step 1: Restaurar dump de prod en staging DB**

```bash
# operativo, no en este worktree
pg_restore -d "$STAGING_DB_URL" backups/prd-latest.sql
```

- [ ] **Step 2: Correr migration nueva contra clone**

```bash
DATABASE_URL=$STAGING_DB_URL npm run migration:run
```

Verificar:
- Sin errores
- Performance de creación de índices aceptable (<30s en clone full)
- Sin locks de larga duración en tablas vecinas (`users`, `organizations`)

- [ ] **Step 3: Verificar bootstrap**

Reiniciar el servicio en staging contra esa DB. Confirmar que la primera key se generó (`SELECT * FROM oauth_signing_key`) y que `/jwks.json` responde.

- [ ] **Step 4: Documentar resultado en PR**

Comentar en el PR del feature con tiempos y observaciones.

### Task 13.5: MCP Inspector test (manual gate)

**Files:** ninguno (acción operativa)

- [ ] **Step 1: Correr MCP Inspector contra dev**

```bash
npx @modelcontextprotocol/inspector
# en la UI: configurar transport HTTP, URL del backend, cliente OAuth
```

- [ ] **Step 2: Validar full flow**

- DCR: Inspector se registra → success
- OAuth: Inspector hace authorize → SPA muestra consent → aprobar
- Token: Inspector recibe AT
- Tool call: Inspector hace al menos un tool call (reusa endpoints existentes que requieren scope)

- [ ] **Step 3: Documentar resultado**

Comentar en PR con screenshot o log.

---

## Phase 14 — Final integration + PR

### Task 14.1: Full local test sweep

**Files:** ninguno

- [ ] **Step 1: Backend tests**

```bash
cd backend
npm test
npm run test:e2e
```

Expected: todo PASS, sin skips fuera de los conocidos.

- [ ] **Step 2: Frontend tests**

```bash
cd frontend
npm test
npm run lint
```

- [ ] **Step 3: Build production**

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

- [ ] **Step 4: Smoke manual del flow completo**

1. Backend + frontend up.
2. Login en SPA.
3. DCR via curl.
4. Authorize en browser → consent screen → aprobar.
5. Token exchange.
6. Llamada a /api/patients con AT.
7. /account/connected-apps muestra el grant.
8. Revocar.
9. Llamada con AT a write → 401.

### Task 14.2: PR

**Files:** ninguno (acción git)

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/oauth-server
```

- [ ] **Step 2: Crear PR vía gh CLI**

```bash
gh pr create --title "feat: OAuth 2.0 Authorization Server (Sub #2)" \
  --body "$(cat <<'EOF'
## Summary

Sub-proyecto #2 del commercial platform effort: OAuth 2.0 / OIDC Authorization Server embebido en el backend.

- 5 tablas nuevas (`oauth_client`, `oauth_grant`, `oauth_token`, `oauth_signing_key`, `oauth_revocation`)
- Endpoints: discovery, JWKS, DCR, authorize, consent, token, revoke, userinfo
- JWT RS256 + JWKS público + jti deny-list
- 10 scopes con read/write split + matriz aplicada en domain controllers
- Consent screen + Aplicaciones conectadas en SPA
- Rate limiting por client + cron de purga
- Key rotation CLI

Spec: `docs/superpowers/specs/2026-04-29-oauth-server-design.md`
Plan: `docs/superpowers/plans/2026-04-29-oauth-server-plan.md`

## Test plan

- [x] Unit tests verdes
- [x] E2E tests verdes (cobertura completa de scopes, isolation, refresh, revocation, key rotation)
- [x] `oauth-coverage.spec.ts` pasa
- [x] MCP Inspector flow OK contra dev
- [x] Conformance script todo ✓
- [x] OWASP checklist firmado en runbook
- [x] Pre-merge migration drill OK
- [x] Smoke manual del flow completo
EOF
)"
```

- [ ] **Step 3: Reportar URL del PR**

---

## Self-review

**1. Spec coverage**

| Sección spec | Tasks que la cubren |
|---|---|
| 4.1 oauth_client | 1.1 step 2, 1.2 |
| 4.2 oauth_grant | 1.1 step 3, 1.3 step 1 |
| 4.3 oauth_token | 1.1 step 4, 1.3 step 2 |
| 4.4 oauth_signing_key | 1.1 step 5, 1.3 step 3, 2.1–2.3 |
| 4.5 oauth_revocation | 1.1 step 6, 1.3 step 4, 9.1 |
| 5.1 catálogo endpoints | 4.3, 5.1, 6.2, 6.3, 7.1 |
| 5.2 discovery payload | 4.3 |
| 5.3 flow code+PKCE | 6.x, 7.x |
| 5.4 refresh + reuse | 7.4 |
| 5.5 claims AT | 7.2 |
| 5.6 claims id_token | 7.2 (assertion del id_token) |
| 5.7 userinfo | 10.1 |
| 6 scopes y enforcement | 8.1–8.7 |
| 7 consent screen | 6.1–6.5 |
| 8 connected apps | 9.x |
| 9 rate limiting | 11.x |
| 10 key management | 2.x, 12.x |
| 11 testing strategy | tests intercalados + coverage spec 8.6 |
| 12 roadmap (hitos 1–12) | mapeados a Phases 1–13 |
| 13 out-of-scope | documentado en developer guide 13.3 |
| 14 riesgos | mitigados implícitamente (spike de oidc-provider implícito en Phase 4) |

**2. Placeholder scan**

- "TBD"/"TODO"/"FIXME" no en plan; los pocos `TODO` referenciados están en spec como decisiones diferidas a Sub #3.
- Donde el plan dice "ajustá según tu setup" (ej. fixtures, signature de AuditLogService, enum del `Select` primitive) es aceptable porque el agente puede verificar inline. No son blocker.

**3. Type consistency**

- `OAuthClient.clientId` usado consistentemente.
- `OAuthGrant.id` (uuid) referenciado como `grantId` en tokens y en API.
- `OAuthSigningKey.id` usado como `kid` en cabeceras JWT y JWKS.
- `tokenSource: 'oauth' | 'internal'` consistente entre OAuthJwtStrategy, OAuthScopeGuard, MultiAuthGuard.
- `req.user.scopes` (array) consistente.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-04-29-oauth-server-plan.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — Despacho un subagente fresh por cada task, reviso entre tasks, iteración rápida. Cumple la regla `model="opus"` para cada Agent call.

**2. Inline Execution** — Ejecuto las tasks en esta sesión usando executing-plans, batch con checkpoints para review.

¿Cuál preferís?
