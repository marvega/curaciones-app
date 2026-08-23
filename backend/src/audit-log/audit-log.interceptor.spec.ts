/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-explicit-any */
// The Nest ExecutionContext / CallHandler doubles are typed as `any`, matching
// the convention in the guard specs (see oauth-scope.guard.spec.ts).
import { firstValueFrom, of } from 'rxjs';
import {
  AuditLogInterceptor,
  redactResponseBody,
} from './audit-log.interceptor';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';

function makeCtx(req: Record<string, any>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: 'POST',
    path: '/api/org/invitations',
    body: { email: 'nuevo@cesfam.cl', role: 'clinician' },
    user: { id: 7, username: 'owner', organizationId: '1' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
    ...overrides,
  };
}

const TOKEN = 'AbCdEf0123456789_-AbCdEf0123456789_-AbCdEfg';
const ACCEPT_URL = `https://curaciones.web.app/accept-invitation?token=${TOKEN}`;

describe('AuditLogInterceptor', () => {
  let log: jest.Mock;
  let interceptor: AuditLogInterceptor;

  beforeEach(() => {
    log = jest.fn().mockResolvedValue(undefined);
    interceptor = new AuditLogInterceptor({
      log,
    } as unknown as AuditLogService);
  });

  async function run(req: Record<string, any>, responseBody: unknown) {
    const next = { handle: () => of(responseBody) } as any;
    await firstValueFrom(interceptor.intercept(makeCtx(req), next));
    return log.mock.calls[0]?.[0];
  }

  describe('POST /api/org/invitations', () => {
    it('never persists the invitation token anywhere in the audit entry', async () => {
      const entry = await run(makeReq(), { id: '42', acceptUrl: ACCEPT_URL });

      expect(entry).toBeDefined();
      expect(JSON.stringify(entry)).not.toContain(TOKEN);
      expect(entry.afterJson.acceptUrl).toBe('[REDACTED]');
    });

    it('keeps the rest of the audit record, including the invitation id', async () => {
      const entry = await run(makeReq(), { id: '42', acceptUrl: ACCEPT_URL });

      expect(entry).toEqual(
        expect.objectContaining({
          userId: 7,
          username: 'owner',
          organizationId: '1',
          action: AuditAction.CREATE,
          entity: 'org',
          entityId: 42,
          payload: { email: 'nuevo@cesfam.cl', role: 'clinician' },
          afterJson: { id: '42', acceptUrl: '[REDACTED]' },
          requestId: 'req-1',
        }),
      );
    });

    it('hashes entityId as the number its int column stores, not the bigint string', async () => {
      // Invitation.id is a bigint, so it reaches the interceptor as a string.
      // Storing the string in payloadHash would make the row unverifiable —
      // Postgres reads the int column back as a number (see audit:verify).
      const entry = await run(makeReq(), { id: '42', acceptUrl: ACCEPT_URL });

      expect(entry.entityId).toBe(42);
    });

    it('does not invent the marker when the response carries no acceptUrl', async () => {
      const entry = await run(makeReq(), { id: '42' });

      expect(entry.afterJson).toEqual({ id: '42' });
    });

    it('leaves the caller’s response object untouched', async () => {
      const responseBody = { id: '42', acceptUrl: ACCEPT_URL };
      await run(makeReq(), responseBody);

      expect(responseBody.acceptUrl).toBe(ACCEPT_URL);
    });
  });

  // Express is mounted with its defaults, so `strict routing` and `case
  // sensitive routing` are both off: all three spellings below reach the same
  // handler and return 200, and req.path reports whichever one the caller sent.
  // The anchored, case-sensitive pattern this rule used to carry matched only
  // the first, so adding a trailing slash was enough to write the cleartext
  // token into an append-only, hash-chained table.
  describe.each([
    ['exact', '/api/org/invitations'],
    ['trailing slash', '/api/org/invitations/'],
    ['mixed case', '/api/org/Invitations'],
    ['upper case', '/API/ORG/INVITATIONS'],
    ['trailing slash and mixed case', '/api/Org/Invitations/'],
  ])('POST %s (%s)', (_label, path) => {
    it('redacts acceptUrl and never persists the token', async () => {
      const entry = await run(makeReq({ path }), {
        id: '42',
        acceptUrl: ACCEPT_URL,
      });

      expect(entry).toBeDefined();
      expect(entry.afterJson.acceptUrl).toBe('[REDACTED]');
      expect(JSON.stringify(entry)).not.toContain(TOKEN);
    });
  });

  describe('other routes', () => {
    it('audits an unrelated route verbatim', async () => {
      const entry = await run(
        makeReq({ path: '/api/patients', body: { firstName: 'Ana' } }),
        { id: 9, firstName: 'Ana' },
      );

      expect(entry.afterJson).toEqual({ id: 9, firstName: 'Ana' });
    });

    // Inverted deliberately. This used to assert that acceptUrl survives on a
    // route with no rule, which is the route-scoped design stated as a
    // guarantee. Redaction is keyed on the field name now, so the same token
    // returned by any audited handler is caught without anyone declaring the
    // route first.
    it('redacts the declared field on a route that never declared a rule', async () => {
      const entry = await run(makeReq({ path: '/api/patients' }), {
        id: 9,
        acceptUrl: ACCEPT_URL,
      });

      expect(entry.afterJson.acceptUrl).toBe('[REDACTED]');
    });

    it('does not redact GET /api/org/invitations — it is never audited at all', async () => {
      const entry = await run(makeReq({ method: 'GET' }), [{ id: '42' }]);

      expect(entry).toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    });
  });
});

describe('redactResponseBody', () => {
  it('redacts the declared field at the top level', () => {
    expect(redactResponseBody({ id: '42', acceptUrl: ACCEPT_URL })).toEqual({
      id: '42',
      acceptUrl: '[REDACTED]',
    });
  });

  it('leaves a body with no declared field alone', () => {
    expect(redactResponseBody({ id: 9, firstName: 'Ana' })).toEqual({
      id: 9,
      firstName: 'Ana',
    });
  });

  it('redacts inside an array body — the shape the old rule threw on', () => {
    // A bulk-invite handler returning a list used to be a hard error ("declared
    // for POST /api/org/invitations but the body is an array"), which meant the
    // interceptor crashed the request rather than redact it.
    const out = redactResponseBody([
      { id: '1', acceptUrl: ACCEPT_URL },
      { id: '2', acceptUrl: ACCEPT_URL },
    ]);

    expect(out).toEqual([
      { id: '1', acceptUrl: '[REDACTED]' },
      { id: '2', acceptUrl: '[REDACTED]' },
    ]);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it('redacts a nested occurrence', () => {
    const out = redactResponseBody({
      invitation: { id: '42', acceptUrl: ACCEPT_URL },
    });

    expect(out).toEqual({
      invitation: { id: '42', acceptUrl: '[REDACTED]' },
    });
  });

  it('returns a primitive body unchanged', () => {
    expect(redactResponseBody(undefined)).toBeUndefined();
    expect(redactResponseBody(null)).toBeNull();
    expect(redactResponseBody('ok')).toBe('ok');
    expect(redactResponseBody(7)).toBe(7);
  });

  it('preserves values that serialise themselves, such as Date', () => {
    // Rebuilding a Date from Object.entries would store `{}` in the jsonb
    // column instead of the ISO string the audit trail is read back as.
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    const out = redactResponseBody({ createdAt, acceptUrl: ACCEPT_URL }) as {
      createdAt: Date;
      acceptUrl: string;
    };

    expect(out.createdAt).toBe(createdAt);
    expect(JSON.parse(JSON.stringify(out)).createdAt).toBe(
      '2026-08-21T10:00:00.000Z',
    );
    expect(out.acceptUrl).toBe('[REDACTED]');
  });

  it('does not mutate the object it was given', () => {
    const body = { id: '42', acceptUrl: ACCEPT_URL };
    redactResponseBody(body);
    expect(body.acceptUrl).toBe(ACCEPT_URL);
  });

  it('redacts every reference when one object appears twice', () => {
    const shared = { acceptUrl: ACCEPT_URL };
    const out = redactResponseBody({ a: shared, b: shared });

    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(out).toEqual({
      a: { acceptUrl: '[REDACTED]' },
      b: { acceptUrl: '[REDACTED]' },
    });
  });

  it('terminates on a circular body', () => {
    const body: Record<string, unknown> = { acceptUrl: ACCEPT_URL };
    body.self = body;

    const out = redactResponseBody(body) as Record<string, unknown>;

    expect(out.acceptUrl).toBe('[REDACTED]');
    expect(out.self).toBe(out);
  });
});
