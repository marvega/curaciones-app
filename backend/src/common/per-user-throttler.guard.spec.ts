import { sign } from 'jsonwebtoken';
import { PerUserThrottlerGuard } from './per-user-throttler.guard';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

function createGuard(): PerUserThrottlerGuard {
  return new PerUserThrottlerGuard(
    { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
    {} as any,
    {} as any,
  );
}

function callGetTracker(
  guard: PerUserThrottlerGuard,
  req: Record<string, any>,
): Promise<string> {
  return (guard as any).getTracker(req);
}

describe('PerUserThrottlerGuard.getTracker', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('returns user:<sub> for a request with a valid Bearer JWT', async () => {
    const token = sign({ sub: 42, username: 'nurse', role: 'user' }, JWT_SECRET);
    const req = {
      headers: { authorization: `Bearer ${token}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('user:42');
  });

  it('returns IP when there is no Authorization header', async () => {
    const req = { headers: {}, ip: '10.0.0.1' };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('10.0.0.1');
  });

  it('returns IP when the JWT signature is invalid', async () => {
    const tamperedToken = sign({ sub: 42 }, 'wrong-secret');
    const req = {
      headers: { authorization: `Bearer ${tamperedToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('10.0.0.1');
  });

  it('returns IP when the Authorization header is malformed', async () => {
    const req = {
      headers: { authorization: 'NotBearer xyz' },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('10.0.0.1');
  });

  it('returns IP when the JWT is expired', async () => {
    const expiredToken = sign({ sub: 42 }, JWT_SECRET, { expiresIn: '-1h' });
    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('10.0.0.1');
  });
});
