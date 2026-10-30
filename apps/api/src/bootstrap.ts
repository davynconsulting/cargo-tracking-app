import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './common/config';
import { Db } from './db/client';
import { FileStore } from './documents/storage';

export async function createApp(config: AppConfig, db: Db, store?: FileStore): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.create(config, db, store), { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  const doc = new DocumentBuilder()
    .setTitle('NGB cargo tracking API')
    .setDescription('Phase 1 prototype. Schemas are validated with zod at runtime; see src/**/*.schemas.ts.')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  return app;
}
