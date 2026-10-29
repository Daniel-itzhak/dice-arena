import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, SWAGGER_PATH } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));

  const url = await app.getUrl();
  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${url}`);
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Swagger docs at ${url}/${SWAGGER_PATH}`);
  }
}

await bootstrap();
