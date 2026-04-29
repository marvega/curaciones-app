import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { User } from '../src/users/user.entity';
import { Patient } from '../src/patients/patient.entity';
import { Curacion, CuracionType } from '../src/curaciones/curacion.entity';
import { Appointment } from '../src/appointments/appointment.entity';
import { MonthlyCycle } from '../src/cycles/cycle.entity';
import type { EncryptedField } from '../src/kms/encrypted-column.transformer';

let counter = 0;
function nextId() {
  return ++counter;
}

export function resetCounter() {
  counter = 0;
}

// Fake EncryptedField shape for fixtures that bypass the KMS transformer.
// TODO(phase-13.1b): replace with the real KMS-issued payload once the
// encryption pipeline is exercised end-to-end in tests.
function fakeEncrypted(aad: string): EncryptedField {
  return { v: 1, k: '', iv: '', c: '', t: '', aad } as unknown as EncryptedField;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
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
    email: null,
    emailHash: null,
    emailVerifiedAt: new Date(),
    passwordChangedAt: new Date(),
    ...overrides,
  } as Partial<User>);
  return repo.save(user);
}

// TODO(phase-13.1b): admin role now lives on OrganizationMembership.
// createAdmin should also create an Organization + OrganizationMembership
// with role=OWNER. For now this just creates a plain user; tests that depend
// on admin role need to wire the membership themselves.
export async function createAdmin(
  app: INestApplication,
  overrides: Partial<User> = {},
): Promise<User> {
  return createUser(app, overrides);
}

export async function createPatient(
  app: INestApplication,
  overrides: Partial<Patient> = {},
): Promise<Patient> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(Patient);
  const n = nextId();
  const rutPlain = `${10000000 + n}-${n % 10}`;
  const patient = repo.create({
    organizationId: '1',
    rut: fakeEncrypted('Patient.rut:0'),
    rutHash: sha256Hex(rutPlain),
    firstName: `Test${n}`,
    lastName: `Patient${n}`,
    birthDate: '1990-01-15',
    gender: 'Femenino',
    phone: null,
    address: null,
    ...overrides,
  } as Partial<Patient>);
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
