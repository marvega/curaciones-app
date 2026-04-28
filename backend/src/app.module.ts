import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PerUserThrottlerGuard } from './common/per-user-throttler.guard';
import { HealthController } from './health.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './patients/patient.entity';
import { Curacion } from './curaciones/curacion.entity';
import { MonthlyCycle } from './cycles/cycle.entity';
import { User } from './users/user.entity';
import { Appointment } from './appointments/appointment.entity';
import { PatientStatusChange } from './patients/patient-status-change.entity';
import { CuracionEdit } from './curaciones/curacion-edit.entity';
import { PatientsModule } from './patients/patients.module';
import { CuracionesModule } from './curaciones/curaciones.module';
import { ReportsModule } from './reports/reports.module';
import { CyclesModule } from './cycles/cycles.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditLog } from './audit-log/audit-log.entity';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { DashboardModule } from './dashboard/dashboard.module';
import { WoundPhoto } from './wound-photos/wound-photo.entity';
import { WoundPhotosModule } from './wound-photos/wound-photos.module';
import { WoundNote } from './wound-notes/wound-note.entity';
import { WoundNotesModule } from './wound-notes/wound-notes.module';
import { ConsentSignature } from './consent/consent-signature.entity';
import { ConsentModule } from './consent/consent.module';
import { Establishment } from './establishments/establishment.entity';
import { EstablishmentsModule } from './establishments/establishments.module';
import { Product } from './inventory/products/product.entity';
import { ProductCode } from './inventory/products/product-code.entity';
import { ProductsModule } from './inventory/products/products.module';
import { Lot } from './inventory/lots/lot.entity';
import { LotMovement } from './inventory/movements/lot-movement.entity';
import { StockCount } from './inventory/stock-counts/stock-count.entity';
import { CanastaCategory } from './inventory/canasta/canasta-category.entity';
import { CanastaCategoryProduct } from './inventory/canasta/canasta-category-product.entity';
import { LotsModule } from './inventory/lots/lots.module';
import { MovementsModule } from './inventory/movements/movements.module';
import { StockCountsModule } from './inventory/stock-counts/stock-counts.module';
import { CanastaModule } from './inventory/canasta/canasta.module';
import { AuditExportModule } from './inventory/audit-export/audit-export.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const isProd = process.env.NODE_ENV === 'production';
        const defaultLimit = parseInt(process.env.THROTTLE_DEFAULT_LIMIT ?? (isProd ? '200' : '10000'), 10);
        return {
          throttlers: [
            { name: 'default', ttl: 60000, limit: defaultLimit },
          ],
        };
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange, CuracionEdit, AuditLog, WoundPhoto, WoundNote, ConsentSignature, Establishment, Product, ProductCode, Lot, LotMovement, StockCount, CanastaCategory, CanastaCategoryProduct],
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      extra: {
        max: parseInt(process.env.DB_POOL_MAX ?? '3', 10),
        idleTimeoutMillis: 30000,
      },
    }),
    AuthModule,
    UsersModule,
    PatientsModule,
    CuracionesModule,
    ReportsModule,
    CyclesModule,
    AppointmentsModule,
    DashboardModule,
    AuditLogModule,
    WoundPhotosModule,
    WoundNotesModule,
    ConsentModule,
    EstablishmentsModule,
    ProductsModule,
    LotsModule,
    MovementsModule,
    StockCountsModule,
    CanastaModule,
    AuditExportModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: PerUserThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    BootstrapService,
  ],
})
export class AppModule {}
