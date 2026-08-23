import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };
  const valid = () => {
    process.env.PORT = '3001';
    process.env.BACKEND_URL = 'http://api.test';
    process.env.MCP_RESOURCE_URL = 'https://mcp.test';
    process.env.OAUTH_ISSUER = 'http://api.test';
    process.env.OAUTH_JWKS_URL = 'http://api.test/jwks.json';
    process.env.OAUTH_AUDIENCE = 'http://api.test';
  };
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('loads valid env', () => {
    valid();
    process.env.LOG_LEVEL = 'info';

    const cfg = loadConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.backendUrl).toBe('http://api.test');
    expect(cfg.oauth.issuer).toBe('http://api.test');
    expect(cfg.resourceUrl).toBe('https://mcp.test');
  });

  it('throws when BACKEND_URL is missing', () => {
    delete process.env.BACKEND_URL;
    expect(() => loadConfig()).toThrow(/BACKEND_URL/);
  });

  it('defaults LOG_LEVEL to info', () => {
    valid();
    delete process.env.LOG_LEVEL;
    const cfg = loadConfig();
    expect(cfg.logLevel).toBe('info');
  });

  describe('MCP_RESOURCE_URL (RFC 9728 resource identifier)', () => {
    it('throws when missing — it cannot be derived from any other var', () => {
      valid();
      delete process.env.MCP_RESOURCE_URL;
      expect(() => loadConfig()).toThrow(/MCP_RESOURCE_URL/);
    });

    it('strips a trailing slash to the canonical no-slash form', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'https://mcp.test/';
      expect(loadConfig().resourceUrl).toBe('https://mcp.test');
    });

    it('keeps a non-default port', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'https://mcp.test:8443';
      expect(loadConfig().resourceUrl).toBe('https://mcp.test:8443');
    });

    it('rejects a fragment (RFC 9728 §2)', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'https://mcp.test#frag';
      expect(() => loadConfig()).toThrow(/fragment/);
    });

    it('rejects a query component', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'https://mcp.test?a=1';
      expect(() => loadConfig()).toThrow(/query component/);
    });

    it('rejects a path, which would move the well-known URL', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'https://mcp.test/mcp';
      expect(() => loadConfig()).toThrow(/no path/);
    });

    it('rejects plain http on a non-loopback host', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'http://mcp.test';
      expect(() => loadConfig()).toThrow(/https/);
    });

    it('allows http on localhost for development', () => {
      valid();
      process.env.MCP_RESOURCE_URL = 'http://localhost:3001';
      expect(loadConfig().resourceUrl).toBe('http://localhost:3001');
    });
  });
});
