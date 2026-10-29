import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const e2eDatabaseDir = join(tmpdir(), `dice-arena-api-e2e-${process.pid}`);

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          globalSetup: ['test/global-setup.ts'],
          // Every file uses the same SQLite database.
          fileParallelism: false,
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: `file:${join(e2eDatabaseDir, 'e2e.db')}`,
            CORS_ORIGINS: 'http://localhost:5173',
          },
        },
      },
    ],
  },
});
