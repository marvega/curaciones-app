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

  describe('other routes', () => {
    it('audits an unrelated route verbatim', async () => {
      const entry = await run(
        makeReq({ path: '/api/patients', body: { firstName: 'Ana' } }),
        { id: 9, firstName: 'Ana' },
      );

      expect(entry.afterJson).toEqual({ id: 9, firstName: 'Ana' });
    });

    it('does not redact a same-named field on a route with no rule', async () => {
      const entry = await run(makeReq({ path: '/api/patients' }), {
        id: 9,
        acceptUrl: ACCEPT_URL,
      });

      expect(entry.afterJson.acceptUrl).toBe(ACCEPT_URL);
    });

    it('does not redact GET /api/org/invitations — it is never audited at all', async () => {
      const entry = await run(makeReq({ method: 'GET' }), [{ id: '42' }]);

      expect(entry).toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    });
  });
});

describe('redactResponseBody', () => {
  it('is a no-op for a route with no declared redaction', () => {
    const body = { acceptUrl: ACCEPT_URL };
    expect(redactResponseBody('POST', '/api/patients', body)).toBe(body);
  });

  it('only matches the declared method', () => {
    const body = { acceptUrl: ACCEPT_URL };
    expect(redactResponseBody('PUT', '/api/org/invitations', body)).toBe(body);
  });

  it('does not match a sibling path', () => {
    const body = { acceptUrl: ACCEPT_URL };
    expect(redactResponseBody('POST', '/api/org/invitations/9', body)).toBe(
      body,
    );
  });

  it('throws when a declared rule matches a body it cannot redact', () => {
    expect(() =>
      redactResponseBody('POST', '/api/org/invitations', [
        { acceptUrl: ACCEPT_URL },
      ]),
    ).toThrow(/POST \/api\/org\/invitations/);
    expect(() =>
      redactResponseBody('POST', '/api/org/invitations', undefined),
    ).toThrow(/POST \/api\/org\/invitations/);
  });
});
