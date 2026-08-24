import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createOrgWithUser } from './org-isolation/helpers';
import { User } from '../src/users/user.entity';

/**
 * `User.passwordHash` must never leave the process over HTTP.
 *
 * Eleven entities carry a `@ManyToOne(() => User)` relation, and any route that
 * loaded one of them — `relations: ['recordedBy' | 'uploadedBy' | 'witnessedBy'
 * | 'performedBy' | 'editedBy']`, or the equivalent `innerJoinAndSelect` —
 * hydrated the whole `User`, bcrypt hash included, straight into the response
 * body. For `POST /api/wound-notes` that body is also what
 * `mcp-server/src/tools/wound-notes/add-wound-note.ts` feeds to an LLM.
 *
 * The fix is one mechanism, not eight patches: `passwordHash` is
 * `@Column({ select: false })` (user.entity.ts), so TypeORM omits it from every
 * read unless a caller explicitly asks. `AuthService.loadPasswordHash` is the
 * only caller that does.
 *
 * This suite has two halves:
 *
 *  - `leaking routes` pins the eight routes that demonstrably leaked, so the
 *    regression is described in terms of observable HTTP behaviour.
 *  - `governance` is the durable half. It enumerates relations from
 *    `DataSource.entityMetadatas` rather than from a hand-written list, so a
 *    relation added tomorrow is covered the moment it is declared — that is the
 *    test that fails when a *new* route starts leaking, and it fails at the
 *    entity layer before any such route exists.
 */

/** Every JSON path at which `key` occurs, at any nesting depth. */
function pathsToKey(value: unknown, key: string, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => pathsToKey(v, key, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      k === key ? [`${path}.${k}`] : pathsToKey(v, key, `${path}.${k}`),
    );
  }
  return [];
}

describe('User.passwordHash never reaches an HTTP response (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase(app);
  });

  const server = () => app.getHttpServer();

  interface Fixture {
    token: string;
    userId: number;
    orgId: string;
    patientId: number;
    curacionId: number;
    /** The live bcrypt hash, read straight from the column. */
    hash: string;
  }

  async function seed(): Promise<Fixture> {
    const org = await createOrgWithUser(
      app,
      'OrgLeak',
      'leakuser',
      'leak@test.cl',
    );
    const [row] = await ds.query(
      'SELECT "passwordHash" FROM users WHERE id = $1',
      [org.userId],
    );
    const patient = await request(server())
      .post('/api/patients')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({
        rut: '11111111-1',
        firstName: 'Leak',
        lastName: 'Probe',
        birthDate: '1980-01-01',
        gender: 'M',
      })
      .expect(201);
    const curacion = await request(server())
      .post('/api/curaciones')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({
        patientId: patient.body.id,
        type: 'avanzada',
        date: '2026-04-28',
        quantity: 1,
      })
      .expect(201);
    return {
      token: org.accessToken,
      userId: org.userId,
      orgId: org.orgId,
      patientId: patient.body.id,
      curacionId: curacion.body.id,
      hash: row.passwordHash,
    };
  }

  /**
   * Two independent assertions, because each catches what the other misses:
   * the key scan survives a change of hash format, and the substring scan
   * survives a rename of the property.
   */
  function expectNoHash(body: unknown, hash: string, label: string) {
    expect(pathsToKey(body, 'passwordHash')).toEqual([]);
    expect(hash).toMatch(/^\$2[aby]\$/); // fixture sanity: a real bcrypt hash
    expect(JSON.stringify(body ?? null)).not.toContain(hash);
    // Keeps `label` load-bearing in the failure message.
    expect(label).toBeTruthy();
  }

  describe('leaking routes', () => {
    it('POST /api/wound-notes (relations: recordedBy)', async () => {
      const f = await seed();
      const res = await request(server())
        .post('/api/wound-notes')
        .set('Authorization', `Bearer ${f.token}`)
        .send({
          curacionId: f.curacionId,
          woundWidth: 2,
          woundLength: 3,
          notes: 'probe',
        })
        .expect(201);
      expect(res.body.recordedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'POST /api/wound-notes');
    });

    it('GET /api/wound-notes/curacion/:curacionId (relations: recordedBy)', async () => {
      const f = await seed();
      await request(server())
        .post('/api/wound-notes')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ curacionId: f.curacionId })
        .expect(201);
      const res = await request(server())
        .get(`/api/wound-notes/curacion/${f.curacionId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body.recordedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/wound-notes/curacion/:id');
    });

    it('GET /api/wound-notes/patient/:patientId (innerJoinAndSelect wn.recordedBy)', async () => {
      const f = await seed();
      await request(server())
        .post('/api/wound-notes')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ curacionId: f.curacionId })
        .expect(201);
      const res = await request(server())
        .get(`/api/wound-notes/patient/${f.patientId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].recordedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/wound-notes/patient/:id');
    });

    // The cursor branch of GET /api/wound-notes/patient/:patientId — the one
    // the MCP `list_wound_notes` tool calls — joins `recordedBy` the same way,
    // but cannot be asserted over HTTP: it returns 500 today, before and after
    // this change. `findByPatientCursor` combines `take` with joins and orders
    // by the pre-quoted string `'wn."createdAt"'`, which TypeORM cannot resolve
    // to a column when it rewrites the query for the limit, so
    // `createOrderByCombinedWithSelectExpression` throws
    // "Cannot read properties of undefined (reading 'databaseName')". That is a
    // separate, pre-existing availability bug, not a serialization one — out of
    // scope here, and deliberately not papered over with a test that asserts
    // the 500. The projection that branch would return is still covered: the
    // governance test below asserts `WoundNote.recordedBy` selects no
    // `passwordHash`, and that is the same relation and the same select list.

    it('GET /api/wound-photos/patient/:patientId (relations: uploadedBy)', async () => {
      const f = await seed();
      // Inserted directly: the subject under test is the GET projection, and
      // going through the multipart upload route would drag multer's on-disk
      // storage into a serialization test.
      await ds.query(
        `INSERT INTO "wound_photos"("organizationId","patientId","uploadedById","filename","photoDate")
         VALUES ($1,$2,$3,$4,$5)`,
        [f.orgId, f.patientId, f.userId, 'probe.png', '2026-04-28'],
      );
      const res = await request(server())
        .get(`/api/wound-photos/patient/${f.patientId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].uploadedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/wound-photos/patient/:id');
    });

    it('GET /api/consent/patient/:patientId (relations: witnessedBy)', async () => {
      const f = await seed();
      await request(server())
        .post('/api/consent')
        .set('Authorization', `Bearer ${f.token}`)
        .send({
          patientId: f.patientId,
          // 1x1 transparent PNG.
          signature:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          consentText: 'probe',
        })
        .expect(201);
      const res = await request(server())
        .get(`/api/consent/patient/${f.patientId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].witnessedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/consent/patient/:id');
    });

    it('GET /api/patients/:id/status-history (relations: performedBy)', async () => {
      const f = await seed();
      await request(server())
        .post(`/api/patients/${f.patientId}/discharge`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ cancelAppointment: false })
        .expect(201);
      const res = await request(server())
        .get(`/api/patients/${f.patientId}/status-history`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].performedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/patients/:id/status-history');
    });

    it('GET /api/curaciones/:id/edits (relations: editedBy)', async () => {
      const f = await seed();
      await request(server())
        .put(`/api/curaciones/${f.curacionId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ quantity: 2, reason: 'probe' })
        .expect(200);
      const res = await request(server())
        .get(`/api/curaciones/${f.curacionId}/edits`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].editedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/curaciones/:id/edits');
    });

    it('GET /api/curaciones/patient/:patientId (relations: edits.editedBy, two levels deep)', async () => {
      const f = await seed();
      await request(server())
        .put(`/api/curaciones/${f.curacionId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ quantity: 2, reason: 'probe' })
        .expect(200);
      const res = await request(server())
        .get(`/api/curaciones/patient/${f.patientId}`)
        .set('Authorization', `Bearer ${f.token}`)
        .expect(200);
      expect(res.body[0].edits[0].editedBy).toBeDefined();
      expectNoHash(res.body, f.hash, 'GET /api/curaciones/patient/:id');
    });
  });

  describe('governance', () => {
    it('passwordHash is unselectable at the entity layer', () => {
      const column = ds
        .getMetadata(User)
        .columns.find((c) => c.propertyName === 'passwordHash');
      expect(column).toBeDefined();
      // `isSelect: false` is what makes every read below safe. Flipping it back
      // re-opens all eight routes above at once, which is exactly why this
      // assertion is separate from them.
      expect(column!.isSelect).toBe(false);
    });

    it('no credential-shaped column on User is selectable', () => {
      // Widens the guard past `passwordHash` itself: a future `mfaSecret` or
      // `apiToken` on User would be caught here rather than by the next
      // incident. Names that match the pattern but hold no secret go in the
      // allowlist, which is a deliberate edit — not something a new column
      // gets by default.
      const NOT_SECRETS = new Set(['passwordChangedAt']);
      const selectable = ds
        .getMetadata(User)
        .columns.filter(
          (c) =>
            c.isSelect &&
            /password|secret|credential|token|apikey/i.test(c.propertyName) &&
            !NOT_SECRETS.has(c.propertyName),
        )
        .map((c) => c.propertyName);
      expect(selectable).toEqual([]);
    });

    it('every relation to User in the schema resolves without passwordHash', () => {
      // Derived from metadata, not from a list of today's routes: a new
      // `@ManyToOne(() => User)` anywhere in src/ is covered on declaration.
      const relations = ds.entityMetadatas.flatMap((meta) =>
        meta.relations
          .filter((rel) => rel.inverseEntityMetadata.target === User)
          .map((rel) => ({ meta, rel })),
      );
      // Guards against the enumeration silently matching nothing (a refactor of
      // the User import, say) and reporting a vacuous pass.
      expect(relations.length).toBeGreaterThanOrEqual(11);

      const offenders: string[] = [];
      for (const { meta, rel } of relations) {
        const label = `${meta.name}.${rel.propertyName}`;
        // Both ways a route can load the relation: find options and the
        // query builder. TypeORM compiles them differently, so check both.
        const findOptionsSql = ds
          .getRepository(meta.target)
          .createQueryBuilder('e')
          .setFindOptions({ relations: { [rel.propertyName]: true } })
          .getSql();
        const joinSql = ds
          .getRepository(meta.target)
          .createQueryBuilder('e')
          .leftJoinAndSelect(`e.${rel.propertyName}`, 'u')
          .getSql();
        if (/passwordHash/i.test(findOptionsSql))
          offenders.push(`${label} (find options)`);
        if (/passwordHash/i.test(joinSql))
          offenders.push(`${label} (query builder)`);
      }
      expect(offenders).toEqual([]);
    });

    it('a bare User select does not fetch passwordHash', () => {
      expect(
        ds.getRepository(User).createQueryBuilder('u').getSql(),
      ).not.toMatch(/passwordHash/i);
    });
  });

  describe('authentication still works', () => {
    it('login succeeds against the unselectable column', async () => {
      await createOrgWithUser(app, 'OrgAuth', 'authuser', 'auth@test.cl');
      const res = await request(server())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'authuser', password: 'password123' })
        .expect(201);
      expect(res.body.accessToken).toBeTruthy();
      expectNoHash(
        res.body,
        (
          await ds.query(
            `SELECT "passwordHash" FROM users WHERE username = 'authuser'`,
          )
        )[0].passwordHash,
        'POST /api/auth/login',
      );
    });

    it('login rejects a wrong password', async () => {
      await createOrgWithUser(app, 'OrgAuth', 'authuser', 'auth@test.cl');
      await request(server())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'authuser', password: 'wrong-password' })
        .expect(401);
    });

    it('saving an unrelated column does not blank the hash', async () => {
      // `updatePreferences` does findOne -> mutate -> save(user). With
      // `select: false` the loaded entity has no `passwordHash` at all, so if
      // TypeORM ever wrote the missing property back as NULL the account would
      // be unloggable-into from here on. This is that regression guard.
      const org = await createOrgWithUser(
        app,
        'OrgPrefs',
        'prefsuser',
        'prefs@test.cl',
      );
      await request(server())
        .put('/api/users/me/preferences')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ inactivityThresholdDays: 21 })
        .expect(200);
      const [row] = await ds.query(
        'SELECT "passwordHash" FROM users WHERE id = $1',
        [org.userId],
      );
      expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
      await request(server())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'prefsuser', password: 'password123' })
        .expect(201);
    });

    it('change-password rotates the hash and the new password logs in', async () => {
      const org = await createOrgWithUser(
        app,
        'OrgChg',
        'chguser',
        'chg@test.cl',
      );
      await request(server())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'brand-new-password-1',
        })
        .expect(204);
      await request(server())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'chguser', password: 'brand-new-password-1' })
        .expect(201);
      await request(server())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'chguser', password: 'password123' })
        .expect(401);
    });

    it('change-password rejects a wrong current password', async () => {
      const org = await createOrgWithUser(
        app,
        'OrgChg',
        'chguser',
        'chg@test.cl',
      );
      await request(server())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({
          currentPassword: 'not-the-password',
          newPassword: 'brand-new-password-1',
        })
        .expect(401);
    });
  });
});
