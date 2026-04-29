import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CuracionesService } from './curaciones.service';
import { Curacion, CuracionType } from './curacion.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { DataSource } from 'typeorm';
import { KMS_SERVICE } from '../kms/kms.service';
import { runWithOrg } from '../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('CuracionesService', () => {
  let service: CuracionesService;

  const mockCuracionRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
  };

  const mockEditRepo = {
    find: jest.fn(),
  };

  const mockAppointmentsService = {
    createLinked: jest.fn(() => Promise.resolve({ id: 10 })),
    updateLinked: jest.fn(() => Promise.resolve({ id: 10 })),
    removeWithManager: jest.fn(() => Promise.resolve()),
  };

  const mockManager = {
    findOne: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
    create: jest.fn((_Entity, dto) => dto),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CuracionesService,
        { provide: getRepositoryToken(Curacion), useValue: mockCuracionRepo },
        { provide: getRepositoryToken(CuracionEdit), useValue: mockEditRepo },
        { provide: AppointmentsService, useValue: mockAppointmentsService },
        { provide: DataSource, useValue: mockDataSource },
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
    service = module.get(CuracionesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a curacion without appointment', inOrg(async () => {
      const dto = {
        patientId: 1,
        type: CuracionType.AVANZADA,
        date: '2026-03-20',
        quantity: 2,
        observations: 'test',
      };
      mockCuracionRepo.save.mockResolvedValueOnce({ id: 5, ...dto });
      mockCuracionRepo.findOne.mockResolvedValueOnce({ id: 5, ...dto, appointment: null });

      const result = await service.create(dto);

      expect(mockCuracionRepo.create).toHaveBeenCalledWith({
        organizationId: '1',
        patientId: 1,
        type: CuracionType.AVANZADA,
        date: '2026-03-20',
        quantity: 2,
        observations: null,
        bootDelivered: undefined,
      });
      expect(mockCuracionRepo.save).toHaveBeenCalled();
      expect(mockAppointmentsService.createLinked).not.toHaveBeenCalled();
      expect(result.id).toBe(5);
    }));

    it('creates a curacion with linked appointment', inOrg(async () => {
      const dto = {
        patientId: 1,
        type: CuracionType.PIE_DIABETICO,
        date: '2026-03-20',
        appointmentDate: '2026-04-01',
        appointmentTime: '13:00',
      };
      mockCuracionRepo.save.mockResolvedValueOnce({ id: 6, patientId: 1 });
      mockCuracionRepo.findOne.mockResolvedValueOnce({
        id: 6,
        appointment: { id: 10, date: '2026-04-01', time: '13:00' },
      });

      const result = await service.create(dto);

      expect(mockAppointmentsService.createLinked).toHaveBeenCalledWith(
        1, 6, '2026-04-01', '13:00',
      );
      expect(result.appointment).toBeDefined();
    }));
  });

  describe('findByPatient', () => {
    it('returns ordered list with relations', inOrg(async () => {
      const curaciones = [
        { id: 2, date: '2026-03-20', appointment: null, edits: [] },
        { id: 1, date: '2026-03-19', appointment: null, edits: [] },
      ];
      mockCuracionRepo.find.mockResolvedValueOnce(curaciones);

      const result = await service.findByPatient(1);

      expect(mockCuracionRepo.find).toHaveBeenCalledWith({
        where: { patientId: 1, organizationId: '1' },
        relations: ['appointment', 'edits', 'edits.editedBy'],
        order: { date: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
    }));
  });

  describe('findOneWithAppointment', () => {
    it('returns curacion with appointment relation', inOrg(async () => {
      mockCuracionRepo.findOne.mockResolvedValueOnce({
        id: 1,
        appointment: { id: 10 },
      });

      const result = await service.findOneWithAppointment(1);

      expect(mockCuracionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1, organizationId: '1' },
        relations: ['appointment'],
      });
      expect(result.appointment).toBeDefined();
    }));
  });

  describe('update', () => {
    it('updates type and quantity, creates CuracionEdit', inOrg(async () => {
      const existingCuracion = {
        id: 1,
        patientId: 1,
        type: CuracionType.AVANZADA,
        quantity: 1,
        appointment: null,
      };
      mockManager.findOne.mockResolvedValueOnce({ ...existingCuracion });
      mockCuracionRepo.findOne.mockResolvedValueOnce({
        id: 1,
        type: CuracionType.PIE_DIABETICO,
        quantity: 3,
        appointment: null,
      });

      const dto = {
        type: CuracionType.PIE_DIABETICO,
        quantity: 3,
        reason: 'correction',
      };

      const result = await service.update(1, dto, 99);

      expect(mockManager.save).toHaveBeenCalledTimes(2); // curacion + edit
      expect(mockManager.create).toHaveBeenCalledWith(CuracionEdit, {
        curacionId: 1,
        editedById: 99,
        reason: 'correction',
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    }));

    it('creates appointment when curacion had none', inOrg(async () => {
      mockManager.findOne.mockResolvedValueOnce({
        id: 1,
        patientId: 5,
        type: CuracionType.AVANZADA,
        quantity: 1,
        appointment: null,
      });
      mockCuracionRepo.findOne.mockResolvedValueOnce({ id: 1, appointment: { id: 20 } });

      const dto = {
        appointmentDate: '2026-04-15',
        appointmentTime: '14:00',
        reason: 'add appointment',
      };

      await service.update(1, dto, 99);

      expect(mockAppointmentsService.createLinked).toHaveBeenCalledWith(
        5, 1, '2026-04-15', '14:00', mockManager,
      );
      expect(mockAppointmentsService.updateLinked).not.toHaveBeenCalled();
    }));

    it('updates existing appointment', inOrg(async () => {
      mockManager.findOne.mockResolvedValueOnce({
        id: 1,
        patientId: 5,
        type: CuracionType.AVANZADA,
        quantity: 1,
        appointment: { id: 20, date: '2026-04-10', time: '13:00' },
      });
      mockCuracionRepo.findOne.mockResolvedValueOnce({ id: 1, appointment: { id: 20 } });

      const dto = {
        appointmentDate: '2026-04-15',
        appointmentTime: '14:00',
        reason: 'reschedule',
      };

      await service.update(1, dto, 99);

      expect(mockAppointmentsService.updateLinked).toHaveBeenCalledWith(
        20, '2026-04-15', '14:00', mockManager,
      );
    }));

    it('removes appointment when null/null passed', inOrg(async () => {
      mockManager.findOne.mockResolvedValueOnce({
        id: 1,
        patientId: 5,
        type: CuracionType.AVANZADA,
        quantity: 1,
        appointment: { id: 20, date: '2026-04-10', time: '13:00' },
      });
      mockCuracionRepo.findOne.mockResolvedValueOnce({ id: 1, appointment: null });

      const dto = {
        appointmentDate: null as any,
        appointmentTime: null as any,
        reason: 'remove appointment',
      };

      await service.update(1, dto, 99);

      expect(mockAppointmentsService.removeWithManager).toHaveBeenCalledWith(20, mockManager);
    }));

    it('throws NotFoundException for non-existent curacion', inOrg(async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      const dto = { reason: 'test' };

      await expect(service.update(999, dto, 99)).rejects.toThrow(NotFoundException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    }));
  });

  describe('getEdits', () => {
    it('returns ordered edit history', inOrg(async () => {
      const edits = [
        { id: 2, curacionId: 1, createdAt: new Date('2026-03-20'), editedBy: { id: 1 } },
        { id: 1, curacionId: 1, createdAt: new Date('2026-03-19'), editedBy: { id: 2 } },
      ];
      mockEditRepo.find.mockResolvedValueOnce(edits);

      const result = await service.getEdits(1);

      expect(mockEditRepo.find).toHaveBeenCalledWith({
        where: { curacionId: 1, organizationId: '1' },
        relations: ['editedBy'],
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
    }));
  });
});
