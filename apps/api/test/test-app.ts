import { randomBytes } from 'node:crypto';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

/** Boots the real AppModule behind the same HTTP stack as main.ts, plus any test-only modules and controllers. */
export async function createTestApp({
  imports = [],
  controllers = [],
}: Pick<ModuleMetadata, 'imports' | 'controllers'> = {}): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...imports], controllers }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** All e2e files share one database per run, so every account needs a name no other test uses. */
export function uniqueUsername(prefix = 'player'): string {
  return `${prefix}${randomBytes(4).toString('hex')}`;
}
