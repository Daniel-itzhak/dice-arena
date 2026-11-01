import { z } from 'zod';

const DEV_API_BASE_URL = 'http://localhost:3000/api';

const EnvSchema = z.object({
  VITE_API_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default(DEV_API_BASE_URL)
    .transform((url) => url.replace(/\/+$/, '')),
});

export interface WebEnv {
  /** API origin plus its `/api` prefix, without a trailing slash. */
  apiBaseUrl: string;
}

function loadEnv(): WebEnv {
  const result = EnvSchema.safeParse(import.meta.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return { apiBaseUrl: result.data.VITE_API_BASE_URL };
}

export const env = loadEnv();
