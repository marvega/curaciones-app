import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';

const PER_TRACKER_LIMIT = 5;

async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
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

async function loginAs(app: INestApplication, username: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password });
  if (!res.body.access_token) {
    throw new Error(`Failed to login as ${username}: ${JSON.stringify(res.body)}`);
  }
  return res.body.access_token;
}

describe('PerUserThrottlerGuard (e2e)', () => {
  let app: INestApplication;
  const originalLimit = process.env.THROTTLE_DEFAULT_LIMIT;
  const originalLogin = process.env.THROTTLE_LOGIN_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_DEFAULT_LIMIT = String(PER_TRACKER_LIMIT);
    process.env.THROTTLE_LOGIN_LIMIT = '10000';
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (originalLimit === undefined) delete process.env.THROTTLE_DEFAULT_LIMIT;
    else process.env.THROTTLE_DEFAULT_LIMIT = originalLimit;
    if (originalLogin === undefined) delete process.env.THROTTLE_LOGIN_LIMIT;
    else process.env.THROTTLE_LOGIN_LIMIT = originalLogin;
  });

  beforeEach(async () => {
    const ds = app.get(DataSource);
    for (const entity of ds.entityMetadatas) {
      await ds.getRepository(entity.name).query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
    }
    await app.get(UsersService).seed();
  });

  it('throttles a single user after the limit is reached', async () => {
    const token = await loginAs(app, 'admin', 'A}B5sxY%2=qy');

    for (let i = 0; i < PER_TRACKER_LIMIT; i++) {
      await request(app.getHttpServer())
        .get('/api/patients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .expect(429);
  });

  it('keeps user B working after user A is throttled (same IP)', async () => {
    const tokenA = await loginAs(app, 'admin', 'A}B5sxY%2=qy');
    const tokenB = await loginAs(app, 'cynthia', 'pompeya2026');

    for (let i = 0; i < PER_TRACKER_LIMIT; i++) {
      await request(app.getHttpServer())
        .get('/api/patients')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(429);

    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
  });
});
