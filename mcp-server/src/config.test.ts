import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('loads valid env', () => {
    process.env.PORT = '3001';
    process.env.BACKEND_URL = 'http://api.test';
    process.env.OAUTH_ISSUER = 'http://api.test';
    process.env.OAUTH_JWKS_URL = 'http://api.test/jwks.json';
    process.env.OAUTH_AUDIENCE = 'http://api.test';
    process.env.LOG_LEVEL = 'info';

    const cfg = loadConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.backendUrl).toBe('http://api.test');
    expect(cfg.oauth.issuer).toBe('http://api.test');
  });

  it('throws when BACKEND_URL is missing', () => {
    delete process.env.BACKEND_URL;
    expect(() => loadConfig()).toThrow(/BACKEND_URL/);
  });

  it('defaults LOG_LEVEL to info', () => {
    process.env.PORT = '3001';
    process.env.BACKEND_URL = 'http://api.test';
    process.env.OAUTH_ISSUER = 'http://api.test';
    process.env.OAUTH_JWKS_URL = 'http://api.test/jwks.json';
    process.env.OAUTH_AUDIENCE = 'http://api.test';
    delete process.env.LOG_LEVEL;
    const cfg = loadConfig();
    expect(cfg.logLevel).toBe('info');
  });
});
