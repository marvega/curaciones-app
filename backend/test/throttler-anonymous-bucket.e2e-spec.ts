import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PerUserThrottlerGuard } from '../src/common/per-user-throttler.guard';

/**
 * End-to-end proof that two anonymous callers arriving from the *same* IP get
 * separate rate-limit buckets on the login route.
 *
 * Why a purpose-built module instead of AppModule. `throttler.e2e-spec.ts` boots
 * the whole AppModule and cannot run at all under the CI jest config: `app.init()`
 * fires `OidcProviderSingleton.onApplicationBootstrap`, which dynamic-imports the
 * ESM-only `oidc-provider` and dies with "A dynamic import callback was invoked
 * without --experimental-vm-modules". That is why it sits on the KNOWN_RED list
 * in jest-e2e-ci.cjs, and it is unrelated to throttling — so it cannot be the
 * suite that pins this behaviour. This one wires the real ThrottlerGuard, the
 * real in-memory throttler storage, the real guard subclass and a real HTTP
 * server, and leaves out only the parts that cannot boot here.
 *
 * Why the shared IP needs no simulating: supertest connects over loopback, so
 * `req.ip` is 127.0.0.1 for every request below. That is precisely the production
 * condition — `firebase.json` routes /api/** through Firebase Hosting and
 * `trust proxy` is 1, so `req.ip` is Hosting's egress address, identical for
 * every user of the app. A tracker that reads only `req.ip` therefore puts every
 * request in this file into one bucket.
 */

const LIMIT = 3;

@Controller('api/auth')
class LoginStubController {
  // Mirrors AuthController.login: same throttler, same body field. The limit is
  // the production shape (a small per-minute cap), shrunk so the test is quick.
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  login(@Body() body: { usernameOrEmail?: string }) {
    return { ok: true, who: body?.usernameOrEmail ?? null };
  }
}

@Controller('oauth')
class RegisterStubController {
  // Mirrors OAuthRegisterController.register: a DCR body carries nothing
  // trustworthy to key on, so these requests must all share the IP bucket.
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: LIMIT } })
  register(@Body() body: { client_name?: string }) {
    return { ok: true, name: body?.client_name ?? null };
  }
}

describe('anonymous rate-limit buckets (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // A fresh app per test means a fresh in-memory throttler store, so one
    // test's exhausted buckets cannot leak into the next.
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: LIMIT }],
        }),
      ],
      controllers: [LoginStubController, RegisterStubController],
      providers: [{ provide: APP_GUARD, useClass: PerUserThrottlerGuard }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  function login(usernameOrEmail: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usernameOrEmail, password: 'irrelevant' });
  }

  async function exhaust(usernameOrEmail: string) {
    for (let i = 0; i < LIMIT; i++) {
      await login(usernameOrEmail).expect(201);
    }
    await login(usernameOrEmail).expect(429);
  }

  it('does not let one caller spend another caller’s login bucket', async () => {
    await exhaust('admin');

    // The clinic-wide lockout, as an HTTP assertion: a second nurse logging in
    // from the same egress IP is unaffected.
    await login('cynthia').expect(201);
  });

  it('leaves every other caller working after one is locked out', async () => {
    await exhaust('admin');

    for (const other of ['cynthia', 'marcelo', 'tens@cesfam.cl', 'kine1']) {
      await login(other).expect(201);
    }
  });

  it('still caps repeated attempts against a single account', async () => {
    // The protection the shared bucket was providing must survive: brute force
    // against one account is still capped.
    await exhaust('admin');
    await login('admin').expect(429);
  });

  it('cannot be escaped by case-rotating one account’s email', async () => {
    // findUserByUsernameOrEmail lower-cases the email before hashing it
    // (auth.service.ts:37), so these spellings are one account and must not
    // buy three separate buckets.
    await login('tens@cesfam.cl').expect(201);
    await login('TENS@CESFAM.CL').expect(201);
    await login('Tens@Cesfam.Cl').expect(201);

    await login('tens@cesfam.cl').expect(429);
  });

  it('keeps dynamic client registration on one shared bucket', async () => {
    // Deliberate: every field of a DCR body is caller-chosen, so keying on one
    // would void the cap. Rotating client_name must not buy a new bucket.
    const register = (client_name: string) =>
      request(app.getHttpServer())
        .post('/oauth/register')
        .send({ client_name, redirect_uris: ['https://x.test/cb'] });

    for (let i = 0; i < LIMIT; i++) {
      await register(`client-${i}`).expect(201);
    }
    await register('client-fresh-name').expect(429);
  });

  it('keeps the login and registration buckets separate for one caller', async () => {
    // ThrottlerGuard.generateKey folds in the controller class and handler name,
    // so exhausting login must not spend the registration allowance.
    await exhaust('admin');

    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'x', redirect_uris: ['https://x.test/cb'] })
      .expect(201);
  });
});
