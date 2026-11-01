import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the apps/api package; this module sits two levels below it in both src/ and dist/. */
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const ENV_FILE_PATH = resolve(API_ROOT, '.env');

export const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db';

/**
 * Anchors a relative SQLite `file:` URL to the apps/api package root so the Prisma CLI and the
 * running app open the same database file regardless of the current working directory.
 */
export function resolveSqliteUrl(url: string): string {
  const filePath = url.slice('file:'.length);
  return isAbsolute(filePath) ? url : `file:${resolve(API_ROOT, filePath)}`;
}
