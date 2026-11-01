import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

const API_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Creates a throwaway SQLite database with all migrations applied, and deletes it after the run. */
export default function setup(project: TestProject): () => void {
  const databaseUrl = project.config.env['DATABASE_URL'];
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('The e2e project must set DATABASE_URL to a SQLite file: URL.');
  }

  const databaseDir = dirname(databaseUrl.slice('file:'.length));
  mkdirSync(databaseDir, { recursive: true });
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  return () => rmSync(databaseDir, { recursive: true, force: true });
}
