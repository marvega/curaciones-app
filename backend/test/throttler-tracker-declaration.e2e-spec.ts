import {
  Body,
  Controller,
  INestApplication,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { IsString } from 'class-validator';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { PerUserThrottlerGuard } from '../src/common/per-user-throttler.guard';
import {
  ThrottleIdentity,
  bodyField,
} from '../src/common/throttle-identity.decorator';

/**
 * The measurement, not the reasoning: how many distinct rate-limit buckets a
 * sequence of requests actually consumes.
 *
 * A tracker bug is only visible as a bucket count. Asserting on 429s can only
 * see it indirectly and needs the limit to be reached first; recording the keys
 * the guard hands to storage counts the buckets straight out of the mechanism.
 * `RecordingStorage` is the real `ThrottlerStorage` contract with a tape.
 *
 * Everything below goes over real HTTP through a real Nest app with the real
 * global guard and the real `ValidationPipe({ whitelist: true })` from
 * `main.ts`, because the bug being pinned lives exactly in that ordering:
 * guards run before pipes, so `whitelist` has not yet dropped the unknown field
 * by the time the tracker is computed. A unit test calling `getTracker`
 * directly cannot see that, and neither can one that omits the pipe.
 */
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

  /** Distinct buckets consumed since the last reset. */
  buckets(): number {
    return new Set(this.keys).size;
  }

  reset(): void {
    this.keys.length = 0;
    this.hits.clear();
  }
}

class LoginDto {
  @IsString()
  usernameOrEmail!: string;

  @IsString()
  password!: string;
}

const LIMIT = 100; // high on purpose: this file counts buckets, not 429s.

@Controller('api/auth')
class LoginStubController {
  // Mirrors AuthController.login: same throttler, same DTO, same declaration.
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  @ThrottleIdentity(bodyField('usernameOrEmail'))
  login(@Body() dto: LoginDto) {
    return { ok: true, who: dto.usernameOrEmail };
  }
}

@Controller('oauth')
class RegisterStubController {
  // Mirrors OAuthRegisterController.register: declares nothing, because every
  // field of a DCR body is caller-chosen.
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  register(@Body() body: Record<string, unknown>) {
    return { ok: true, name: body?.client_name ?? null };
  }
}

describe('rate-limit tracker comes from the handler, not the body (e2e)', () => {
  let app: INestApplication;
  let storage: RecordingStorage;

  beforeEach(async () => {
    storage = new RecordingStorage();
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: LIMIT }],
          storage,
        }),
      ],
      controllers: [LoginStubController, RegisterStubController],
      providers: [{ provide: APP_GUARD, useClass: PerUserThrottlerGuard }],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same pipe configuration as main.ts. Present so the test cannot be read as
    // "the whitelist would have saved us": it is here, and it does not.
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

  function login(body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/auth/login').send(body);
  }

  it('spends one bucket for five logins carrying five random client_ids', async () => {
    // The bypass, as a number. Before the handler-declared discriminator this
    // was 5 buckets from 5 requests: `client_id` led the body-sniffing list, so
    // an attacker appending one unknown field to the login body minted a fresh
    // 5-per-minute bucket per attempt and the per-account cap was gone.
    for (let i = 0; i < 5; i++) {
      await login({
        client_id: randomBytes(8).toString('hex'),
        usernameOrEmail: 'admin',
        password: 'wrong',
      }).expect(201);
    }

    expect(storage.buckets()).toBe(1);
  });

  it('spends one bucket whatever undeclared field the caller invents', async () => {
    // Not a client_id special case: no undeclared field may reach the tracker,
    // whatever it is called. These are the other names the old body-sniffing
    // list honoured, plus one that never appeared in it.
    const inventions = [
      { token: randomBytes(8).toString('hex') },
      { email: `${randomBytes(4).toString('hex')}@attacker.test` },
      { refreshToken: randomBytes(8).toString('hex') },
      { refresh_token: randomBytes(8).toString('hex') },
      { client_id: randomBytes(8).toString('hex') },
      { entirely_made_up: randomBytes(8).toString('hex') },
    ];

    for (const invention of inventions) {
      await login({
        ...invention,
        usernameOrEmail: 'admin',
        password: 'wrong',
      }).expect(201);
    }

    expect(storage.buckets()).toBe(1);
  });

  it('still gives five accounts five buckets', async () => {
    // The property the discriminator exists to defend, and the one the mutation
    // control removes: per-account capping. Every request here arrives from the
    // same loopback IP, which is the production condition behind Firebase
    // Hosting, so a tracker that ignored the declaration would show 1.
    for (const who of [
      'admin',
      'cynthia',
      'marcelo',
      'kine1',
      'tens@cesfam.cl',
    ]) {
      await login({ usernameOrEmail: who, password: 'wrong' }).expect(201);
    }

    expect(storage.buckets()).toBe(5);
  });

  it('keeps one account on one bucket while an attacker rotates client_id', async () => {
    // Both halves at once, which is what makes the mutation control bite: the
    // declared field decides, and nothing else does. Two accounts, five
    // attacker-chosen client_ids each, must be exactly two buckets — 1 would
    // mean the declaration was ignored, 10 would mean client_id still counted.
    for (const who of ['admin', 'cynthia']) {
      for (let i = 0; i < 5; i++) {
        await login({
          usernameOrEmail: who,
          password: 'wrong',
          client_id: randomBytes(8).toString('hex'),
        }).expect(201);
      }
    }

    expect(storage.buckets()).toBe(2);
  });

  it('puts a route that declares nothing on one shared bucket', async () => {
    // Dynamic client registration: 10/hour for the whole app, deliberately, and
    // the field an attacker would key on is `client_name`. Five rotations, one
    // bucket.
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/oauth/register')
        .send({
          client_name: `client-${i}`,
          redirect_uris: ['https://x.test/cb'],
        })
        .expect(201);
    }

    expect(storage.buckets()).toBe(1);
  });
});
