import { Repository } from 'typeorm';
import { OAuthToken, OAuthTokenKind } from '../entities/oauth-token.entity';

const NAME_TO_KIND: Record<string, OAuthTokenKind> = {
  Session: 'session',
  AccessToken: 'access',
  AuthorizationCode: 'authorization_code',
  RefreshToken: 'refresh',
  Interaction: 'interaction',
  RegistrationAccessToken: 'registration_access_token',
  // ClientCredentials, DeviceCode, BackchannelAuthenticationRequest not used in v1
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
        // typeorm's QueryDeepPartialEntity types Record<string, unknown> as a
        // recursive query expression; cast to silence the false positive.
        payload: payload as unknown as OAuthToken['payload'],
        grantId: (payload.grantId as string) ?? null,
        clientId: (payload.clientId as string) ?? null,
        userId: payload.accountId ? Number(payload.accountId) : null,
        organizationId: (payload as any).organizationId ?? null,
        expiresAt,
        consumed: Boolean(payload.consumed),
      } as any,
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
