import { z } from 'zod';

/**
 * Environment is validated once at boot and never read via process.env
 * elsewhere. A missing secret should stop the server starting, not surface as
 * a confusing failure during a tournament.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters — generate one, do not invent it'),
  /** Comma-separated origins allowed to call the API with credentials. */
  CORS_ORIGINS: z.string().default(''),
  /**
   * Whether the session cookie is marked Secure.
   *
   * Deliberately explicit rather than inferred from NODE_ENV. A staging stack
   * runs with NODE_ENV=production but may be served over plain HTTP before a
   * certificate exists, and a Secure cookie is silently never sent back — the
   * user signs in successfully and every following request is a 401.
   *
   * Leave unset to follow NODE_ENV. Set to false ONLY for an HTTP-only stack,
   * and turn it back on the moment TLS is in place.
   */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type Config = z.infer<typeof schema> & {
  isProduction: boolean;
  cookieSecure: boolean;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const isProduction = parsed.data.NODE_ENV === 'production';
  const cookieSecure = parsed.data.COOKIE_SECURE ?? isProduction;

  if (isProduction && !cookieSecure) {
    console.warn(
      'WARNING: session cookies are not marked Secure. Only acceptable for an ' +
        'HTTP-only staging stack — set COOKIE_SECURE=true once TLS is in place.',
    );
  }

  return {
    ...parsed.data,
    isProduction,
    cookieSecure,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
