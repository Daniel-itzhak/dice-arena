import { z } from 'zod';
import { DEFAULT_DATABASE_URL, resolveSqliteUrl } from './paths.js';

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

/** Lets development and tests run without configuration; production refuses to start without a real secret. */
const DEV_JWT_SECRET = 'dice-arena-development-only-jwt-secret';
const JWT_SECRET_MIN_LENGTH = 32;
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 12 * 60 * 60;

const OriginSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => !URL.canParse(value) || new URL(value).origin === value, {
    error: 'must be a bare origin such as http://localhost:5173 (no path or trailing slash)',
  });

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .string()
      .startsWith('file:', 'must be a SQLite file: URL')
      .default(DEFAULT_DATABASE_URL)
      .transform(resolveSqliteUrl),
    /** Comma-separated list of browser origins allowed to call the API. */
    CORS_ORIGINS: z
      .string()
      .default(DEFAULT_CORS_ORIGIN)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(OriginSchema).min(1)),
    SWAGGER_ENABLED: z.stringbool().optional(),
    /** HMAC key for signing access tokens (HS256). */
    JWT_SECRET: z
      .string()
      .min(JWT_SECRET_MIN_LENGTH, `must be at least ${JWT_SECRET_MIN_LENGTH} characters`)
      .optional(),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(DEFAULT_JWT_EXPIRES_IN_SECONDS),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.JWT_SECRET !== undefined, {
    path: ['JWT_SECRET'],
    error: 'is required when NODE_ENV=production',
  })
  .transform(({ SWAGGER_ENABLED, JWT_SECRET, ...env }) => ({
    ...env,
    SWAGGER_ENABLED: SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
    JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET,
  }));

export type Env = z.output<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
