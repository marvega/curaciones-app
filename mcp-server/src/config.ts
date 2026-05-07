import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  BACKEND_URL: z.string().url(),
  OAUTH_ISSUER: z.string().url(),
  OAUTH_JWKS_URL: z.string().url(),
  OAUTH_AUDIENCE: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = {
  port: number;
  backendUrl: string;
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
    oauth: { issuer: env.OAUTH_ISSUER, jwksUrl: env.OAUTH_JWKS_URL, audience: env.OAUTH_AUDIENCE },
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
  };
}
