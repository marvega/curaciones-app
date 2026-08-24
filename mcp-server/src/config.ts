import { z } from 'zod';

/**
 * This server's own public origin, used as the RFC 9728 resource identifier.
 *
 * It cannot be derived from anything else the process knows: `BACKEND_URL` and
 * `OAUTH_ISSUER` both point at the app origin behind Firebase Hosting, while
 * this service answers on its own `*.run.app` origin. Cloud Run does expose the
 * host per-request, but the resource identifier has to be a single stable value
 * that matches what the AS was asked for, so it is configuration.
 *
 * Constraints come straight from RFC 9728 §2 ("a URL that uses the `https`
 * scheme and has no fragment component", and "SHOULD NOT include a query
 * component"). The extra no-path rule is ours: with an empty path the metadata
 * URL is simply origin + `/.well-known/oauth-protected-resource`, and the
 * path-insertion rule of §3 never has to be implemented. `http` is allowed
 * only for loopback so local development and tests keep working.
 */
const resourceUrl = z
  .string()
  .url()
  .superRefine((raw, ctx) => {
    const u = new URL(raw);
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must use https (http allowed only for localhost)' });
    }
    if (u.hash) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must not contain a fragment' });
    if (u.search) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must not contain a query component' });
    if (u.pathname !== '/' && u.pathname !== '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be an origin with no path' });
    }
  })
  // Normalised to the no-trailing-slash form, which the MCP spec says
  // implementations SHOULD use consistently for canonical resource URIs.
  .transform((raw) => new URL(raw).origin);

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  BACKEND_URL: z.string().url(),
  MCP_RESOURCE_URL: resourceUrl,
  OAUTH_ISSUER: z.string().url(),
  OAUTH_JWKS_URL: z.string().url(),
  OAUTH_AUDIENCE: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = {
  port: number;
  backendUrl: string;
  /** RFC 9728 resource identifier for this server. Origin, no trailing slash. */
  resourceUrl: string;
  oauth: { issuer: string; jwksUrl: string; audience: string };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'production' | 'test';
};

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid env: ${missing}`);
  }
  const env = parsed.data;
  return {
    port: env.PORT,
    backendUrl: env.BACKEND_URL,
    resourceUrl: env.MCP_RESOURCE_URL,
    oauth: { issuer: env.OAUTH_ISSUER, jwksUrl: env.OAUTH_JWKS_URL, audience: env.OAUTH_AUDIENCE },
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
  };
}
