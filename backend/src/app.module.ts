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
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const isProd = process.env.NODE_ENV === 'production';
        const defaultLimit = parseInt(process.env.THROTTLE_DEFAULT_LIMIT ?? (isProd ? '200' : '10000'), 10);
        const loginLimit = parseInt(process.env.THROTTLE_LOGIN_LIMIT ?? (isProd ? '5' : '10000'), 10);
        return {
          throttlers: [
            { name: 'default', ttl: 60000, limit: defaultLimit },
            { name: 'login', ttl: 60000, limit: loginLimit },
          ],
        };
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange, CuracionEdit, AuditLog, WoundPhoto, WoundNote, ConsentSignature],
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
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: PerUserThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    BootstrapService,
  ],
})
export class AppModule {}
