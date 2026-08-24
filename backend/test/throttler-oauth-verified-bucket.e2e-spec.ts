import {
  Body,
  Controller,
  INestApplication,
  Post,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { randomBytes } from 'crypto';
import type { JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { OAuthClientThrottlerGuard } from '../src/oauth/guards/oauth-client-throttler.guard';
import { OAuthJwtStrategy } from '../src/oauth/strategies/oauth-jwt.strategy';
import {
  ThrottleIdentity,
  bodyField,
} from '../src/common/throttle-identity.decorator';

/**
 * Bucket counts for the guard that actually ships as the global APP_GUARD.
 *
 * `OAuthClientThrottlerGuard` used to build its key from `decode()`, so an
 * `alg: none` bearer with an invented `client_id` bought a fresh bucket per
 * request on every route in the app. The numbers measured on this branch before
 * the fix are quoted in each test below. The tests count keys handed to
 * ThrottlerStorage rather than waiting for 429s, because the quantity in
 * question is the number of buckets, not the moment one fills.
 *
 * `OAuthJwtStrategy` is stubbed, not mocked away: the real one needs Postgres,
 * KMS and a signing key, and what matters here is only the guard's reaction to
 * "this token verifies" versus "it does not". The real verification path is
 * covered end to end, with a real signed access token, by
 * `test/oauth/oauth-rate-limits.e2e-spec.ts`, which must keep passing for this
 * change to be correct — that suite is what proves per-client capping survived.
 */
const ISSUER = 'https://oauth.curaciones.test';

class RecordingStorage implements ThrottlerStorage {
  readonly keys: string[] = [];
  private readonly hits = new Map<string, number>();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    this.keys.push(key);
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return {
      totalHits,
      timeToExpire: ttl,
      isBlocked: totalHits > limit,
      timeToBlockExpire: blockDuration,
    };
  }

  buckets(): number {
    return new Set(this.keys).size;
  }
}

/**
 * Stands in for the real strategy. `verifiable` is the set of token strings it
 * accepts; everything else is rejected exactly as the real one rejects a bad
 * signature, with UnauthorizedException.
 */
class StubStrategy {
  readonly verifyCalls: string[] = [];
  readonly verifiable = new Map<string, JwtPayload>();
  infrastructureFailure: Error | null = null;

  verifyAccessToken(token: string): Promise<JwtPayload> {
    this.verifyCalls.push(token);
    if (this.infrastructureFailure)
      return Promise.reject(this.infrastructureFailure);
    const payload = this.verifiable.get(token);
    if (!payload) {
      return Promise.reject(new UnauthorizedException('invalid signature'));
    }
    return Promise.resolve(payload);
  }
}

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * A three-part bearer with the given payload and no real signature. Whether the
 * guard treats it as genuine depends only on whether the stub strategy was told
 * to accept it — which is the same split the real strategy makes, one layer
 * down. `iss` has to be our issuer for the guard to spend a verification at
 * all, so a token built here reaches the verifier; `forged()` below is the same
 * shape with claims an attacker picked.
 */
function bearer(payload: Record<string, unknown>): string {
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: ISSUER, ...payload })}.`;
}

/** A forged bearer: no signature, caller-chosen client_id, caller-chosen iss. */
function forged(clientId: string, iss: string = ISSUER): string {
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss, client_id: clientId, sub: 7 })}.`;
}

const LIMIT = 100; // high on purpose: this file counts buckets, not 429s.

@Controller('api')
class PatientsStubController {
  @Post('patients')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  create() {
    return { ok: true };
  }
}

@Controller('oauth')
class RegisterStubController {
  // Mirrors OAuthRegisterController.register, the 10/hour cap on a publicly
  // writable table, and declares no discriminator for the same reason it does.
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  register(@Body() body: Record<string, unknown>) {
    return { ok: true, name: body?.client_name ?? null };
  }
}

@Controller('api/auth')
class LoginStubController {
  // Mirrors AuthController.login, so the two fixes can be measured together:
  // the declared discriminator from the handler is only reachable if an
  // unverifiable bearer no longer short-circuits it.
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  @ThrottleIdentity(bodyField('usernameOrEmail'))
  login(@Body() body: { usernameOrEmail?: string }) {
    return { ok: true, who: body?.usernameOrEmail ?? null };
  }
}

describe('OAuth rate-limit buckets come from verified claims only (e2e)', () => {
  let app: INestApplication;
  let storage: RecordingStorage;
  let strategy: StubStrategy;
  const originalIssuer = process.env.OAUTH_ISSUER;

  beforeAll(() => {
    process.env.OAUTH_ISSUER = ISSUER;
  });

  afterAll(() => {
    if (originalIssuer === undefined) delete process.env.OAUTH_ISSUER;
    else process.env.OAUTH_ISSUER = originalIssuer;
  });

  beforeEach(async () => {
    storage = new RecordingStorage();
    strategy = new StubStrategy();
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: LIMIT }],
          storage,
        }),
      ],
      controllers: [
        PatientsStubController,
        RegisterStubController,
        LoginStubController,
      ],
      providers: [
        { provide: OAuthJwtStrategy, useValue: strategy },
        { provide: APP_GUARD, useClass: OAuthClientThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const post = (path: string, bearer?: string, body: object = {}) => {
    const req = request(app.getHttpServer()).post(path);
    if (bearer) req.set('Authorization', `Bearer ${bearer}`);
    return req.send(body);
  };

  it('spends one bucket for five forged bearers rotating client_id', async () => {
    // Before: 5 buckets from 5 requests on /api/patients.
    for (let i = 0; i < 5; i++) {
      await post(
        '/api/patients',
        forged(randomBytes(8).toString('hex')),
      ).expect(201);
    }

    expect(storage.buckets()).toBe(1);
  });

  it('spends one bucket for five forged bearers on dynamic client registration', async () => {
    // Before: 5 buckets from 5 requests, i.e. the 10/hour cap on a publicly
    // writable table removed by a header anyone can type.
    for (let i = 0; i < 5; i++) {
      await post('/oauth/register', forged(randomBytes(8).toString('hex')), {
        client_name: 'x',
        redirect_uris: ['https://x.test/cb'],
      }).expect(201);
    }

    expect(storage.buckets()).toBe(1);
  });

  it('does not let a forged bearer override the login route’s declared bucket', async () => {
    // The two findings interacting. `getTracker` consults the bearer first, so
    // an unverifiable one used to win over the handler's declaration: five
    // logins to the same account with rotating forged client_ids were five
    // buckets even after the declaration existed. Now the forged bearer
    // contributes nothing and the declared account decides — one bucket for one
    // account, two accounts for two.
    for (let i = 0; i < 5; i++) {
      await post('/api/auth/login', forged(randomBytes(8).toString('hex')), {
        usernameOrEmail: 'admin',
        password: 'wrong',
      }).expect(201);
    }
    expect(storage.buckets()).toBe(1);

    await post('/api/auth/login', forged('another'), {
      usernameOrEmail: 'cynthia',
      password: 'wrong',
    }).expect(201);
    expect(storage.buckets()).toBe(2);
  });

  it('keeps one bucket per verified client, and one per (client, subject)', async () => {
    // The property option 3 was chosen to preserve: a real client still gets
    // its own allowance rather than sharing one bucket with every other MCP
    // client behind Hosting's single egress address.
    const tokenA = bearer({ client_id: 'mcp-a', sub: '11' });
    const tokenB = bearer({ client_id: 'mcp-b', sub: '11' });
    const tokenA2 = bearer({ client_id: 'mcp-a', sub: '22' });
    strategy.verifiable.set(tokenA, { client_id: 'mcp-a', sub: '11' });
    strategy.verifiable.set(tokenB, { client_id: 'mcp-b', sub: '11' });
    strategy.verifiable.set(tokenA2, { client_id: 'mcp-a', sub: '22' });

    for (let i = 0; i < 5; i++) {
      await post('/api/patients', tokenA).expect(201);
    }
    expect(storage.buckets()).toBe(1);

    await post('/api/patients', tokenB).expect(201);
    await post('/api/patients', tokenA2).expect(201);

    expect(storage.buckets()).toBe(3);
  });

  it('does not spend a signature check on a token claiming a foreign issuer', async () => {
    // Routing before crypto: a forged token that does not even claim to be ours
    // is rejected by inspection, so an attacker cannot use this guard to make
    // the app do RSA work or load the JWKS.
    for (let i = 0; i < 5; i++) {
      await post(
        '/api/patients',
        forged(randomBytes(8).toString('hex'), 'https://attacker.test'),
      ).expect(201);
    }

    expect(strategy.verifyCalls).toHaveLength(0);
    expect(storage.buckets()).toBe(1);
  });

  it('does not spend a signature check on an internal SPA token', async () => {
    // An HS256 session token has no iss claim, so it never reaches the OAuth
    // verifier; PerUserThrottlerGuard verifies it with JWT_SECRET instead.
    const spa = `${b64({ alg: 'HS256' })}.${b64({ sub: 42 })}.sig`;

    await post('/api/patients', spa).expect(201);

    expect(strategy.verifyCalls).toHaveLength(0);
  });

  it('surfaces an infrastructure failure instead of quietly degrading', async () => {
    // A signing-key store that cannot be read is not a 401 and must not be
    // reported as one. Swallowing it would silently drop every OAuth client
    // onto the shared bucket, which is the class of silent degradation this
    // whole change is about.
    strategy.infrastructureFailure = new Error('KMS unavailable');

    await post('/api/patients', forged('mcp-a')).expect(500);
  });

  it('gives a verified token with no client_id no bucket of its own', async () => {
    // oidc-provider always emits client_id (RFC 9068 §2.2). If one somehow
    // arrives without it there is no client to bucket, and inventing one would
    // merge unrelated clients.
    const clientless = bearer({ sub: '11' });
    strategy.verifiable.set(clientless, { iss: ISSUER, sub: '11' });

    await post('/api/patients', clientless).expect(201);
    // Same bucket a caller with no bearer at all would have got.
    await post('/api/patients').expect(201);

    expect(strategy.verifyCalls).toHaveLength(1);
    expect(storage.buckets()).toBe(1);
  });
});
