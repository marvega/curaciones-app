import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PatientPdfService } from './patient-pdf.service';
import { Patient } from './patient.entity';
import {
  PatientStatusChange,
  PatientStatus,
  PatientStatusChangeType,
} from './patient-status-change.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { KMS_SERVICE } from '../kms/kms.service';
import { runWithOrg } from '../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('PatientPdfService', () => {
  let service: PatientPdfService;

  const mockPatientRepo = { findOne: jest.fn() };
  const mockCuracionRepo = { find: jest.fn() };
  const mockAppointmentRepo = { find: jest.fn() };
  const mockStatusChangeRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientPdfService,
        { provide: getRepositoryToken(Patient), useValue: mockPatientRepo },
        { provide: getRepositoryToken(Curacion), useValue: mockCuracionRepo },
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockAppointmentRepo,
        },
        {
          provide: getRepositoryToken(PatientStatusChange),
          useValue: mockStatusChangeRepo,
        },
        {
          provide: KMS_SERVICE,
          useValue: {
            encrypt: jest.fn(async () => ({ v: 1, k: '', iv: '', c: '', t: '', aad: '' })),
            decrypt: jest.fn(async () => 'fake-plaintext'),
            rotateDek: jest.fn(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PatientPdfService);
  });

  it('throws NotFoundException when patient does not exist', inOrg(async () => {
    mockPatientRepo.findOne.mockResolvedValue(null);
    await expect(service.generatePdf(999)).rejects.toThrow(NotFoundException);
  }));

  it('returns a Buffer with PDF magic bytes for an existing patient', inOrg(async () => {
    mockPatientRepo.findOne.mockResolvedValue({
      id: 42,
      firstName: 'María',
      lastName: 'Pérez',
      rut: '12.345.678-9',
      birthDate: '1955-04-12',
      gender: 'Femenino',
      phone: '+56 9 1234 5678',
      address: 'Calle Falsa 123, Quilpué',
      status: PatientStatus.ACTIVE,
    });
    mockCuracionRepo.find.mockResolvedValue([
      {
        date: '2026-04-20',
        type: 'avanzada',
        quantity: 1,
        observations: 'Sin novedad.',
      },
      {
        date: '2026-04-15',
        type: 'pie_diabetico',
        quantity: 2,
        observations: '',
      },
    ]);
    mockAppointmentRepo.find.mockResolvedValue([
      { date: '2026-05-01', time: '10:30' },
      { date: '2026-05-08', time: '11:00' },
    ]);
    mockStatusChangeRepo.find.mockResolvedValue([
      {
        type: PatientStatusChangeType.READMISSION,
        createdAt: new Date('2026-03-10T14:25:00'),
        performedBy: { username: 'enfermera1' },
      },
    ]);

    const pdf = await service.generatePdf(42);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }));

  it('handles a patient with no curaciones, citas or historial', inOrg(async () => {
    mockPatientRepo.findOne.mockResolvedValue({
      id: 7,
      firstName: 'Juan',
      lastName: 'González',
      rut: '11.111.111-1',
      birthDate: '1980-01-01',
      gender: 'Masculino',
      phone: null,
      address: null,
      status: PatientStatus.DISCHARGED,
    });
    mockCuracionRepo.find.mockResolvedValue([]);
    mockAppointmentRepo.find.mockResolvedValue([]);
    mockStatusChangeRepo.find.mockResolvedValue([]);

    const pdf = await service.generatePdf(7);

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }));
});
