import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { KMS_SERVICE, KmsService } from '../kms/kms.service';
import { InMemoryKmsService } from '../kms/in-memory-kms.service';
import { runWithOrg } from '../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('DashboardService', () => {
  let service: DashboardService;
  let appointmentsService: AppointmentsService;
  let patientRepo: any;
  let curacionRepo: any;
  let kms: KmsService;

  const mockQueryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getRawMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Patient),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Curacion),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: {},
        },
        {
          provide: AppointmentsService,
          useValue: {
            getAgenda: jest.fn(),
          },
        },
        { provide: KMS_SERVICE, useClass: InMemoryKmsService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    appointmentsService = module.get<AppointmentsService>(AppointmentsService);
    patientRepo = module.get(getRepositoryToken(Patient));
    curacionRepo = module.get(getRepositoryToken(Curacion));
    kms = module.get(KMS_SERVICE);
  });

  async function patientWithEncryptedRut(id: number, firstName: string, lastName: string, rut: string) {
    const enc = await kms.encrypt(rut, `Patient.rut:${id}`, '1');
    return { id, firstName, lastName, rut: enc };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTodayAppointments', () => {
    it('should delegate to appointmentsService.getAgenda with today date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockAgenda = [
        {
          id: 1,
          date: today,
          time: '13:00',
          source: 'standalone',
          patient: { id: 1, firstName: 'Ana', lastName: 'Lopez', rut: '12345678-9' },
        },
      ];
      (appointmentsService.getAgenda as jest.Mock).mockResolvedValue(mockAgenda);

      const result = await service.getTodayAppointments();

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(today, today);
      expect(result).toEqual(mockAgenda);
    });
  });

  describe('getPatientsWithoutAppointment', () => {
    it('should return active patients with no future appointments and last curacion data', inOrg(async () => {
      const mockPatients = [
        await patientWithEncryptedRut(1, 'Ana', 'Lopez', '12345678-9'),
        await patientWithEncryptedRut(2, 'Carlos', 'Martinez', '98765432-1'),
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockPatients);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      (curacionRepo.findOne as jest.Mock)
        .mockResolvedValueOnce({
          date: thirtyDaysAgo,
          type: 'avanzada',
        })
        .mockResolvedValueOnce(null);

      const result = await service.getPatientsWithoutAppointment();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        firstName: 'Ana',
        lastName: 'Lopez',
        rut: '12345678-9',
      });
      expect(result[0].lastCuracion).toMatchObject({
        date: thirtyDaysAgo,
        type: 'avanzada',
      });
      expect(result[0].daysSinceLastCuracion).toBeGreaterThanOrEqual(29);

      expect(result[1].lastCuracion).toBeNull();
      expect(result[1].daysSinceLastCuracion).toBeNull();
    }));
  });

  describe('getInactivePatients', () => {
    it('should return patients whose last curacion exceeds threshold', inOrg(async () => {
      const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const enc1 = await kms.encrypt('12345678-9', 'Patient.rut:1', '1');
      const enc2 = await kms.encrypt('98765432-1', 'Patient.rut:2', '1');
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          id: 1,
          firstName: 'Ana',
          lastName: 'Lopez',
          rut: enc1,
          lastCuracionDate: oldDate,
        },
        {
          id: 2,
          firstName: 'Carlos',
          lastName: 'Martinez',
          rut: enc2,
          lastCuracionDate: null,
        },
      ]);

      (curacionRepo.findOne as jest.Mock).mockResolvedValueOnce({
        type: 'pie_diabetico',
      });

      const result = await service.getInactivePatients(14);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        firstName: 'Ana',
        lastName: 'Lopez',
        lastCuracionType: 'pie_diabetico',
      });
      expect(result[0].daysSinceLastCuracion).toBeGreaterThanOrEqual(19);

      expect(result[1]).toMatchObject({
        id: 2,
        firstName: 'Carlos',
        lastName: 'Martinez',
        lastCuracionDate: null,
        lastCuracionType: null,
        daysSinceLastCuracion: null,
      });
      expect(result[0].rut).toBe('12345678-9');
      expect(result[1].rut).toBe('98765432-1');
    }));
  });
});
