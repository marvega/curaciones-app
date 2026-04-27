import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
      entities: [Patient, Curacion, MonthlyCycle, User, Appointment, PatientStatusChange, CuracionEdit],
      synchronize: true,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    UsersModule,
    PatientsModule,
    CuracionesModule,
    ReportsModule,
    CyclesModule,
    AppointmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: PerUserThrottlerGuard },
    BootstrapService,
  ],
})
export class AppModule {}
