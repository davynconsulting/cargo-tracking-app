import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { ClientsController } from './clients/clients.controller';
import { AppConfig, CONFIG, DB } from './common/config';
import { Db } from './db/client';
import { DocumentsController } from './documents/documents.controller';
import { DiskFileStore, FILE_STORE, FileStore } from './documents/storage';
import { ExceptionsController } from './exceptions/exceptions.controller';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import { HealthController } from './health.controller';
import { ShipmentsController } from './shipments/shipments.controller';
import { ShipmentsService } from './shipments/shipments.service';

@Module({})
export class AppModule {
  static create(config: AppConfig, db: Db, store: FileStore = new DiskFileStore(config.fileStorageDir)): DynamicModule {
    return {
      module: AppModule,
      imports: [JwtModule.register({ secret: config.jwtSecret })],
      controllers: [
        HealthController,
        AuthController,
        ClientsController,
        ShipmentsController,
        ExceptionsController,
        DocumentsController,
        FinanceController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: FILE_STORE, useValue: store },
        { provide: APP_GUARD, useClass: AuthGuard },
        ShipmentsService,
        FinanceService,
      ],
    };
  }
}
