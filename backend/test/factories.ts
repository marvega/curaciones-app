import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../src/users/user.entity';
import { Patient } from '../src/patients/patient.entity';
import { Curacion, CuracionType } from '../src/curaciones/curacion.entity';
import { Appointment } from '../src/appointments/appointment.entity';
import { MonthlyCycle } from '../src/cycles/cycle.entity';

let counter = 0;
function nextId() {
  return ++counter;
}

export function resetCounter() {
  counter = 0;
}

export async function createUser(
  app: INestApplication,
  overrides: Partial<User> = {},
): Promise<User> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(User);
  const n = nextId();
  const hash = await bcrypt.hash('password123', 10);
  const user = repo.create({
    username: `testuser${n}`,
    passwordHash: hash,
    role: 'user',
    ...overrides,
  });
  return repo.save(user);
}

export async function createAdmin(
  app: INestApplication,
  overrides: Partial<User> = {},
): Promise<User> {
  return createUser(app, { role: 'admin', ...overrides });
}

export async function createPatient(
  app: INestApplication,
  overrides: Partial<Patient> = {},
): Promise<Patient> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Patient);
  const n = nextId();
  const patient = repo.create({
    rut: `${10000000 + n}-${n % 10}`,
    firstName: `Test${n}`,
    lastName: `Patient${n}`,
    birthDate: '1990-01-15',
    gender: 'Femenino',
    ...overrides,
  });
  return repo.save(patient);
}

export async function createCuracion(
  app: INestApplication,
  patientId: number,
  overrides: Partial<Curacion> = {},
): Promise<Curacion> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Curacion);
  const curacion = repo.create({
    patientId,
    type: CuracionType.AVANZADA,
    date: '2026-03-20',
    quantity: 1,
    ...overrides,
  });
  return repo.save(curacion);
}

export async function createAppointment(
  app: INestApplication,
  patientId: number,
  overrides: Partial<Appointment> = {},
): Promise<Appointment> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Appointment);
  const appointment = repo.create({
    patientId,
    date: '2026-04-01',
    time: '13:00',
    ...overrides,
  });
  return repo.save(appointment);
}

export async function createCycle(
  app: INestApplication,
  overrides: Partial<MonthlyCycle> = {},
): Promise<MonthlyCycle> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(MonthlyCycle);
  const cycle = repo.create({
    year: 2026,
    month: 3,
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    ...overrides,
  });
  return repo.save(cycle);
}
