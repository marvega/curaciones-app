import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createOrgWithUser } from './org-isolation/helpers';

/**
 * Real-SQL coverage for all four cursor-paginated endpoints. These are the
 * endpoints the MCP server drives (`search_patients`, `list_curaciones`,
 * `list_wound_notes`, `search_inventory`), and before this suite not one of them
 * had a test that emitted SQL: every existing spec stubs the service or the
 * QueryBuilder, so `getMany()` was never called against Postgres.
 *
 * The defect that motivated the suite. `WoundNotesService.findByPatientCursor`
 * and `ProductsService.findByCursor` both combined `.take(n + 1)` with a
 * joined-and-selected relation. TypeORM answers that combination by paginating
 * *entities* rather than *rows* — see
 * `SelectQueryBuilder.executeEntitiesAndRawResults`, which branches on
 * `(skip || take) && joinAttributes.length > 0`. It runs a first query selecting
 * `DISTINCT` primary keys from a `distinctAlias` subquery, then a second query
 * loading full rows for those ids. Rewriting ORDER BY into that subquery goes
 * through `createOrderByCombinedWithSelectExpression`, which splits each
 * order-by key on `.` and resolves the remainder as an entity *property path*.
 * A pre-quoted key — `'wn."createdAt"'` — resolves to the property `"createdAt"`,
 * quotes included, which matches no column; the lookup returns `undefined` and
 * the request dies with
 * `TypeError: Cannot read properties of undefined (reading 'databaseName')`
 * before any SQL reaches the database. Both endpoints returned 500 on every
 * call to their cursor branch.
 *
 * `patients` and `curaciones` carry the same pre-quoted `orderBy` but no joins,
 * so they never enter that branch. They are covered here anyway: the shape is
 * one `joinAndSelect` away from the same failure, and the walk below is what
 * would catch it.
 *
 * Why the walk matters as much as the 200. Making an order-by resolvable is easy
 * to do in a way that quietly disagrees with what the cursor encodes — ordering
 * by `c.date` while the cursor carries `wn.createdAt`, say. The symptom is not
 * an error but rows silently skipped or repeated between pages, which for a
 * clinical record is worse than a 500. Walking every page of a set larger than
 * the page size and asserting the concatenation equals the full ordering, id for
 * id, is the assertion that catches that.
 */
describe('cursor pagination across services (e2e)', () => {
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

  interface Org {
    token: string;
    orgId: string;
  }

  let seq = 0;
  async function newOrg(): Promise<Org> {
    seq += 1;
    const org = await createOrgWithUser(
      app,
      `OrgCursor${seq}`,
      `cursoruser${seq}`,
      `cursor${seq}@test.cl`,
    );
    return { token: org.accessToken, orgId: org.orgId };
  }

  /**
   * The ordering a `(createdAt, id)` cursor encodes, read straight from
   * Postgres. Asserting against this rather than against creation order keeps
   * the test honest when two rows land on the same `createdAt` microsecond:
   * `(createdAt, id)` is still a strict total order, and this is the order the
   * endpoint must reproduce.
   */
  async function expectedOrder(sql: string, params: unknown[]): Promise<number[]> {
    const rows = await ds.query(sql, params);
    return rows.map((r: { id: number }) => Number(r.id));
  }

  /**
   * Millisecond offsets, in creation order, that make `createdAt` order
   * disagree with `id` order and put two rows on an identical timestamp.
   *
   * Sequentially inserted rows have `createdAt` ascending with `id`, so *any*
   * stable ordering — order by the wrong column, break ties the wrong way —
   * reproduces the same sequence, and a walk over such rows cannot tell a
   * correct implementation from a lucky one. Mutation testing showed exactly
   * that: replacing `orderBy('wn.createdAt')` with `orderBy('c.date')`, and
   * flipping the `id` tie-break to ASC, both left the suite green.
   *
   * Applying these offsets fixes both gaps. The resulting `(createdAt DESC,
   * id DESC)` sequence is not id-descending, so ordering by anything else is
   * detectable; and index 2 and index 4 share a timestamp, so the `id`
   * tie-break is load-bearing rather than unreachable. The values are whole
   * milliseconds, which a JS `Date` represents exactly, so the cursor
   * round-trip is lossless and the walk is deterministic.
   */
  const SKEW_MS = [3000, 1000, 5000, 2000, 5000, 4000, 0];

  /** Rewrite `createdAt` on `table` for `ids`, in creation order. */
  async function applySkew(table: string, ids: number[]): Promise<void> {
    expect(ids).toHaveLength(SKEW_MS.length);
    for (let i = 0; i < ids.length; i += 1) {
      await ds.query(
        `UPDATE "${table}"
            SET "createdAt" = TIMESTAMP '2026-04-28 10:00:00.000'
                              + ($1 || ' milliseconds')::interval
          WHERE id = $2`,
        [SKEW_MS[i], ids[i]],
      );
    }
  }

  /**
   * Follow `nextCursor` to exhaustion. `url(limit, cursor)` must produce a URL
   * whose response is `{ items, nextCursor }`.
   */
  async function walk(
    org: Org,
    url: (limit: number, cursor: string) => string,
    limit: number,
  ): Promise<{ ids: number[]; pages: number }> {
    const ids: number[] = [];
    let cursor = '';
    let pages = 0;
    // Hard stop well above any expected page count, so a cursor that fails to
    // advance surfaces as a failed assertion rather than an infinite loop.
    while (pages < 50) {
      const res = await request(server())
        .get(url(limit, encodeURIComponent(cursor)))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);
      pages += 1;
      ids.push(...res.body.items.map((r: { id: number }) => r.id));
      if (!res.body.nextCursor) break;
      // A full page is the contract for "there is more". A short non-final page
      // would mean entity pagination had degraded into row pagination.
      expect(res.body.items).toHaveLength(limit);
      cursor = res.body.nextCursor;
    }
    return { ids, pages };
  }

  // ---------------------------------------------------------------- patients

  async function seedPatients(org: Org, count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const res = await request(server())
        .post('/api/patients')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          rut: `1000000${i}-${i % 10}`,
          firstName: `Paciente${i}`,
          lastName: 'Cursor',
          birthDate: '1980-01-01',
          gender: 'M',
        })
        .expect(201);
      ids.push(res.body.id);
    }
    return ids;
  }

  // -------------------------------------------------------------- curaciones

  async function seedCuraciones(
    org: Org,
    patientId: number,
    count: number,
  ): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const res = await request(server())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          patientId,
          type: 'avanzada',
          // Identical dates on every curacion. The non-cursor `findByPatient`
          // orders by `c.date`, which ties here; the cursor protocol needs
          // `(createdAt, id)`. A fix that reached for `date` to satisfy the
          // subquery would be caught by the walk.
          date: '2026-04-28',
          quantity: 1,
        })
        .expect(201);
      ids.push(res.body.id);
    }
    return ids;
  }

  // ------------------------------------------------------------- wound notes

  async function seedWoundNotes(
    org: Org,
    curacionIds: number[],
  ): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < curacionIds.length; i += 1) {
      const res = await request(server())
        .post('/api/wound-notes')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          curacionId: curacionIds[i],
          woundWidth: 2,
          woundLength: 3,
          notes: `nota ${i}`,
        })
        .expect(201);
      ids.push(res.body.id);
    }
    return ids;
  }

  // ---------------------------------------------------------------- products

  /**
   * Every other product carries two `codes` rows, so the `@OneToMany` fan-out
   * is real. That fan-out is why `take` is *correct* in `findByCursor` and
   * `limit` would not be: one product with two codes is two SQL rows but one
   * entity, so `LIMIT 3` would return two products where the caller asked for
   * three. The fix therefore cannot be "stop using take" — the entity
   * pagination strategy has to keep running, which means its ORDER BY rewrite
   * has to work.
   */
  async function seedProducts(org: Org, count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const res = await request(server())
        .post('/api/inventory/products')
        .set('Authorization', `Bearer ${org.token}`)
        .send({
          name: `Producto ${i}`,
          type: 'INSUMO',
          packaging: 'caja',
          codes:
            i % 2 === 0
              ? [
                  { codeSystem: 'RAYEN', code: `R-${i}` },
                  { codeSystem: 'OTRO', code: `O-${i}` },
                ]
              : [],
        })
        .expect(201);
      ids.push(res.body.id);
    }
    return ids;
  }

  // =========================================================================

  describe('GET /api/wound-notes/patient/:patientId?cursor= (MCP list_wound_notes)', () => {
    async function seed(count: number) {
      const org = await newOrg();
      const [patientId] = await seedPatients(org, 1);
      const curacionIds = await seedCuraciones(org, patientId, count);
      const noteIds = await seedWoundNotes(org, curacionIds);
      return { org, patientId, noteIds };
    }

    const url = (patientId: number) => (limit: number, cursor: string) =>
      `/api/wound-notes/patient/${patientId}?limit=${limit}&cursor=${cursor}`;

    const order = (org: Org, patientId: number) =>
      expectedOrder(
        `SELECT wn.id FROM wound_notes wn
           JOIN curaciones c ON c.id = wn."curacionId"
          WHERE c."patientId" = $1 AND wn."organizationId" = $2
          ORDER BY wn."createdAt" DESC, wn.id DESC`,
        [patientId, org.orgId],
      );

    it('returns 200 with {items, nextCursor} and both joined relations', async () => {
      const { org, patientId } = await seed(3);
      const res = await request(server())
        .get(url(patientId)(2, ''))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(typeof res.body.nextCursor).toBe('string');
      // Both `innerJoinAndSelect` relations must survive the fix.
      expect(res.body.items[0].curacion).toBeDefined();
      expect(res.body.items[0].recordedBy).toBeDefined();
      // `notes` is KMS-encrypted at rest and decrypted per page.
      expect(typeof res.body.items[0].notes).toBe('string');
      // `passwordHash` is `select: false`; a joined User must not carry it.
      expect(res.body.items[0].recordedBy.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('$2b$');
    });

    it('returns 200 when a cursor is supplied and terminates', async () => {
      const { org, patientId } = await seed(3);
      const first = await request(server())
        .get(url(patientId)(2, ''))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);
      const res = await request(server())
        .get(url(patientId)(2, encodeURIComponent(first.body.nextCursor)))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.nextCursor).toBeUndefined();
    });

    it('paginating past the page size yields every row exactly once, in order', async () => {
      const { org, patientId, noteIds } = await seed(7);
      const expected = await order(org, patientId);
      expect(expected).toHaveLength(7);

      const { ids, pages } = await walk(org, url(patientId), 3);

      // Every row, exactly once, in the order the cursor encodes.
      expect(ids).toEqual(expected);
      // Stated independently so a failure says which property broke.
      expect(new Set(ids).size).toBe(7);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...noteIds].sort((a, b) => a - b),
      );
      expect(pages).toBe(3); // 3 + 3 + 1
    });

    it('a page size of 1 walks the same sequence', async () => {
      const { org, patientId } = await seed(5);
      const expected = await order(org, patientId);
      const { ids, pages } = await walk(org, url(patientId), 1);
      expect(ids).toEqual(expected);
      expect(pages).toBe(5);
    });

    it('walks (createdAt DESC, id DESC) even when it disagrees with id order', async () => {
      const { org, patientId, noteIds } = await seed(7);
      await applySkew('wound_notes', noteIds);
      const expected = await order(org, patientId);

      // Fixture sanity: without these the walk would pass for the wrong reason.
      // The sequence must not be plain id-descending, and the tie-break must be
      // reachable.
      expect(expected).not.toEqual([...noteIds].sort((a, b) => b - a));
      const stamps = await ds.query(
        `SELECT "createdAt" FROM wound_notes GROUP BY "createdAt" HAVING count(*) > 1`,
      );
      expect(stamps.length).toBe(1);

      const { ids } = await walk(org, url(patientId), 3);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
    });

    it('a page size at or above the row count reports no next page', async () => {
      const { org, patientId } = await seed(4);
      const expected = await order(org, patientId);
      const res = await request(server())
        .get(url(patientId)(4, ''))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);
      expect(res.body.items.map((n: { id: number }) => n.id)).toEqual(expected);
      expect(res.body.nextCursor).toBeUndefined();
    });

    it('rejects a malformed cursor with 400, not 500', async () => {
      const { org, patientId } = await seed(1);
      await request(server())
        .get(url(patientId)(20, 'not-base64url-json'))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(400);
    });
  });

  describe('GET /api/inventory/products?cursor= (MCP search_inventory)', () => {
    const url = (limit: number, cursor: string) =>
      `/api/inventory/products?limit=${limit}&cursor=${cursor}`;

    const order = (org: Org) =>
      expectedOrder(
        `SELECT id FROM products WHERE "organizationId" = $1
          ORDER BY "createdAt" DESC, id DESC`,
        [org.orgId],
      );

    it('returns 200 with {items, nextCursor} and hydrates the one-to-many', async () => {
      const org = await newOrg();
      await seedProducts(org, 3);
      const res = await request(server())
        .get(url(2, ''))
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(typeof res.body.nextCursor).toBe('string');
      const withCodes = res.body.items.find(
        (p: { codes: unknown[] }) => p.codes.length > 0,
      );
      expect(withCodes).toBeDefined();
      expect(withCodes.codes).toHaveLength(2);
    });

    it('paginating past the page size yields every row exactly once, in order', async () => {
      const org = await newOrg();
      const productIds = await seedProducts(org, 7);
      const expected = await order(org);
      expect(expected).toHaveLength(7);

      const { ids, pages } = await walk(org, url, 3);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...productIds].sort((a, b) => a - b),
      );
      expect(pages).toBe(3);
    });

    it('walks (createdAt DESC, id DESC) even when it disagrees with id order', async () => {
      const org = await newOrg();
      const productIds = await seedProducts(org, 7);
      await applySkew('products', productIds);
      const expected = await order(org);

      expect(expected).not.toEqual([...productIds].sort((a, b) => b - a));

      const { ids } = await walk(org, url, 3);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
    });
  });

  describe('GET /api/patients?cursor= (MCP search_patients)', () => {
    const url = (limit: number, cursor: string) =>
      `/api/patients?limit=${limit}&cursor=${cursor}`;

    it('paginating past the page size yields every row exactly once, in order', async () => {
      const org = await newOrg();
      const patientIds = await seedPatients(org, 7);
      const expected = await expectedOrder(
        `SELECT id FROM patients WHERE "organizationId" = $1
          ORDER BY "createdAt" DESC, id DESC`,
        [org.orgId],
      );
      expect(expected).toHaveLength(7);

      const { ids, pages } = await walk(org, url, 3);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...patientIds].sort((a, b) => a - b),
      );
      expect(pages).toBe(3);
    });

    it('walks (createdAt DESC, id DESC) even when it disagrees with id order', async () => {
      const org = await newOrg();
      const patientIds = await seedPatients(org, 7);
      await applySkew('patients', patientIds);
      const expected = await expectedOrder(
        `SELECT id FROM patients WHERE "organizationId" = $1
          ORDER BY "createdAt" DESC, id DESC`,
        [org.orgId],
      );

      expect(expected).not.toEqual([...patientIds].sort((a, b) => b - a));

      const { ids } = await walk(org, url, 3);

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
    });
  });

  describe('GET /api/curaciones/patient/:patientId?cursor= (MCP list_curaciones)', () => {
    it('paginating past the page size yields every row exactly once, in order', async () => {
      const org = await newOrg();
      const [patientId] = await seedPatients(org, 1);
      const curacionIds = await seedCuraciones(org, patientId, 7);
      const expected = await expectedOrder(
        `SELECT id FROM curaciones
          WHERE "patientId" = $1 AND "organizationId" = $2
          ORDER BY "createdAt" DESC, id DESC`,
        [patientId, org.orgId],
      );
      expect(expected).toHaveLength(7);

      const { ids, pages } = await walk(
        org,
        (limit, cursor) =>
          `/api/curaciones/patient/${patientId}?limit=${limit}&cursor=${cursor}`,
        3,
      );

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        [...curacionIds].sort((a, b) => a - b),
      );
      expect(pages).toBe(3);
    });

    it('walks (createdAt DESC, id DESC) even when it disagrees with id order', async () => {
      const org = await newOrg();
      const [patientId] = await seedPatients(org, 1);
      const curacionIds = await seedCuraciones(org, patientId, 7);
      await applySkew('curaciones', curacionIds);
      const expected = await expectedOrder(
        `SELECT id FROM curaciones
          WHERE "patientId" = $1 AND "organizationId" = $2
          ORDER BY "createdAt" DESC, id DESC`,
        [patientId, org.orgId],
      );

      expect(expected).not.toEqual([...curacionIds].sort((a, b) => b - a));

      const { ids } = await walk(
        org,
        (limit, cursor) =>
          `/api/curaciones/patient/${patientId}?limit=${limit}&cursor=${cursor}`,
        3,
      );

      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(7);
    });
  });
});
