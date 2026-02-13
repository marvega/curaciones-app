import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './patients/patient.entity';
import { Curacion } from './curaciones/curacion.entity';
import { MonthlyCycle } from './cycles/cycle.entity';
import { User } from './users/user.entity';
import { PatientsModule } from './patients/patients.module';
import { CuracionesModule } from './curaciones/curaciones.module';
import { ReportsModule } from './reports/reports.module';
import { CyclesModule } from './cycles/cycles.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Patient, Curacion, MonthlyCycle, User],
      synchronize: true,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    UsersModule,
    PatientsModule,
    CuracionesModule,
    ReportsModule,
    CyclesModule,
  ],
  controllers: [HealthController],
  providers: [BootstrapService],
})
export class AppModule {}
