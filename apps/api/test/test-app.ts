import { randomBytes } from 'node:crypto';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

/** Boots the real AppModule behind the same HTTP stack as main.ts, plus any test-only modules and controllers. */
export async function createTestApp({
  imports = [],
  controllers = [],
  configure,
}: Pick<ModuleMetadata, 'imports' | 'controllers'> & {
  /** Adjust providers before the module is compiled, for example to replace the dice. */
  configure?: (builder: TestingModuleBuilder) => void;
} = {}): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule, ...imports], controllers });
  configure?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** All e2e files share one database per run, so every account needs a name no other test uses. */
export function uniqueUsername(prefix = 'player'): string {
  return `${prefix}${randomBytes(4).toString('hex')}`;
}
