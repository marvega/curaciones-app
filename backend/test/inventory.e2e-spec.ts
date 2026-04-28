import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, createAdmin, resetCounter } from './factories';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    await createAdmin(app, { username: 'invadmin' });
    await createUser(app, { username: 'invuser' });

    const ds = app.get(DataSource);
    await ds.query(`INSERT INTO "establishments" ("name", "comuna") VALUES ('CESFAM Test', 'Quilpué')`);

    // Seed canasta categories (production migration applies these; tests need them too)
    const categories: Array<[string, string, number, boolean, string | null]> = [
      ['Apósitos bacteriostáticos', 'INSUMOS', 1, false, 'Ringer+PHMB; DACC; Miel Gel'],
      ['Apósito absorbente', 'INSUMOS', 2, false, null],
      ['Botín antepié', 'AYUDAS_TECNICAS', 12, false, 'Gestión externa por kinesiología'],
    ];
    for (const [name, section, order, optional, notes] of categories) {
      await ds.query(
        `INSERT INTO "canasta_categories" ("name","section","displayOrder","isOptional","notes") VALUES ($1,$2,$3,$4,$5)`,
        [name, section, order, optional, notes],
      );
    }

    const a = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'invadmin', password: 'password123' });
    adminToken = a.body.access_token;
    const u = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'invuser', password: 'password123' });
    userToken = u.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs full flow: import → reception → count → audit export', async () => {
    // 1. Bulk import a small synthetic catalog
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1778, 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD'],
      ['INSUMO', 'UNIDAD', 819, 'GASA 10X10 SIN CLASIFICAR'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'PRODUCTOS AVIS');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const importRes = await request(app.getHttpServer())
      .post('/api/inventory/products/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'catalog.xlsx');
    expect(importRes.status).toBe(201);
    expect(importRes.body.created).toBe(2);

    // Find product 1778
    const list = await request(app.getHttpServer())
      .get('/api/inventory/products?search=RINGER')
      .set('Authorization', `Bearer ${userToken}`);
    const product = list.body.data[0];
    expect(product).toBeDefined();

    const ds = app.get(DataSource);
    const est = await ds.query(`SELECT id FROM "establishments" LIMIT 1`);
    const establishmentId = est[0].id;

    // 2. Reception
    const recv = await request(app.getHttpServer())
      .post('/api/inventory/lots/reception')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        productId: product.id,
        establishmentId,
        lotCode: 'L1',
        expiresAt: '2027-01-01',
        receivedAt: '2026-04-27',
        quantity: 50,
      });
    expect(recv.status).toBe(201);
    const lotId = recv.body.id;

    // 3. Stock count
    const sc = await request(app.getHttpServer())
      .post('/api/inventory/stock-counts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ establishmentId, countDate: '2026-04-27' });
    expect(sc.status).toBe(201);
    const countId = sc.body.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/inventory/stock-counts/${countId}/lots/${lotId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ absoluteValue: 48 });
    expect(patchRes.status).toBe(200);

    // 4. Apply default canasta mappings
    const seed = await request(app.getHttpServer())
      .post('/api/inventory/canasta/seed-defaults')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(seed.status).toBe(201);

    // 5. Export Excel
    const xlsxRes = await request(app.getHttpServer())
      .get(`/api/inventory/audit-export?mode=current&establishmentId=${establishmentId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .responseType('blob');
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');
    const wbOut = XLSX.read(xlsxRes.body, { type: 'buffer' });
    expect(wbOut.SheetNames.length).toBeGreaterThan(0);
  });

  it('rejects /products/import without admin role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/products/import')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('fake'), 'x.xlsx');
    expect(res.status).toBe(403);
  });
});
