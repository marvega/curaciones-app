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
    // grantId column is uuid in the schema, so use a valid UUID literal.
    const grantId = '11111111-1111-1111-1111-111111111111';
    const at = factory('AccessToken');
    const rt = factory('RefreshToken');
    await at.upsert('jti-a', { grantId, sub: '1' }, 600);
    await at.upsert('jti-b', { grantId, sub: '1' }, 600);
    await rt.upsert('rt-a', { grantId, sub: '1' }, 86400);
    await at.revokeByGrantId(grantId);
    expect(await at.find('jti-a')).toBeUndefined();
    expect(await at.find('jti-b')).toBeUndefined();
    expect(await rt.find('rt-a')).toBeUndefined();
  });
});
