import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: process.env.NODE_ENV === 'test'
        ? [{ name: 'default', ttl: 60000, limit: 10000 }, { name: 'login', ttl: 60000, limit: 10000 }]
        : [{ name: 'default', ttl: 60000, limit: 100 }, { name: 'login', ttl: 60000, limit: 5 }],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange, CuracionEdit, AuditLog],
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    UsersModule,
    PatientsModule,
    CuracionesModule,
    ReportsModule,
    CyclesModule,
    AppointmentsModule,
    AuditLogModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    BootstrapService,
  ],
})
export class AppModule {}
