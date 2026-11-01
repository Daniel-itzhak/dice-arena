import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { DEFAULT_DATABASE_URL, ENV_FILE_PATH, resolveSqliteUrl } from './src/config/paths.js';

if (existsSync(ENV_FILE_PATH)) {
  process.loadEnvFile(ENV_FILE_PATH);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: resolveSqliteUrl(process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL) },
});
