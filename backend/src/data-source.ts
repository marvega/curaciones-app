import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Patient } from './patients/patient.entity';
import { Curacion } from './curaciones/curacion.entity';
import { MonthlyCycle } from './cycles/cycle.entity';
import { User } from './users/user.entity';
import { Appointment } from './appointments/appointment.entity';
import { PatientStatusChange } from './patients/patient-status-change.entity';
import { CuracionEdit } from './curaciones/curacion-edit.entity';
import { AuditLog } from './audit-log/audit-log.entity';
import { WoundPhoto } from './wound-photos/wound-photo.entity';
import { WoundNote } from './wound-notes/wound-note.entity';
import { ConsentSignature } from './consent/consent-signature.entity';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Patient,
    Curacion,
    MonthlyCycle,
    User,
    Appointment,
    PatientStatusChange,
    CuracionEdit,
    AuditLog,
    WoundPhoto,
    WoundNote,
    ConsentSignature,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
