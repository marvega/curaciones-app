import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './appointment.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { runWithOrg } from '../common/org-context';
import { KMS_SERVICE } from '../kms/kms.service';
import { InMemoryKmsService } from '../kms/in-memory-kms.service';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  const mockRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity: any) => Promise.resolve({ id: 1, ...entity })),
    findOne: jest.fn(() => Promise.resolve(null)) as jest.Mock<Promise<any>>,
    find: jest.fn(() => Promise.resolve([])) as jest.Mock<Promise<any[]>>,
    remove: jest.fn(() => Promise.resolve()) as jest.Mock<Promise<void>>,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: mockRepo },
        { provide: KMS_SERVICE, useClass: InMemoryKmsService },
      ],
    }).compile();
    service = module.get(AppointmentsService);
    jest.clearAllMocks();
  });

  it('rejects an invalid time slot for a regular day', inOrg(async () => {
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '09:00' }),
    ).rejects.toThrow(BadRequestException);
  }));

  it('accepts a valid PM slot for a regular day', inOrg(async () => {
    const result = await service.create({
      patientId: 1,
      date: '2099-12-01',
      time: '13:00',
    });
    expect(result).toBeDefined();
    expect(mockRepo.save).toHaveBeenCalled();
  }));

  it('rejects a PM slot on a second Friday', inOrg(async () => {
    // 2099-03-13 is the second Friday of March 2099
    await expect(
      service.create({ patientId: 1, date: '2099-03-13', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  }));

  it('accepts an AM slot on a second Friday', inOrg(async () => {
    // 2099-03-13 is the second Friday of March 2099
    const result = await service.create({
      patientId: 1,
      date: '2099-03-13',
      time: '09:00',
    });
    expect(result).toBeDefined();
  }));

  it('rejects a past date', inOrg(async () => {
    await expect(
      service.create({ patientId: 1, date: '2020-01-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  }));

  it('rejects a double-booked slot', inOrg(async () => {
    mockRepo.findOne.mockResolvedValueOnce({ id: 99, date: '2099-12-01', time: '13:00' });
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  }));

  describe('create', () => {
    it('creates standalone appointment with valid slot', inOrg(async () => {
      const result = await service.create({
        patientId: 5,
        date: '2099-12-01',
        time: '14:30',
      });
      expect(result).toBeDefined();
      expect(result.patientId).toBe(5);
      expect(mockRepo.create).toHaveBeenCalledWith({
        patientId: 5,
        date: '2099-12-01',
        time: '14:30',
      });
      expect(mockRepo.save).toHaveBeenCalled();
    }));

    it('throws BadRequestException for past date', inOrg(async () => {
      await expect(
        service.create({ patientId: 1, date: '2000-06-15', time: '13:00' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    }));

    it('throws BadRequestException for double-booked slot', inOrg(async () => {
      mockRepo.findOne.mockResolvedValueOnce({ id: 50, date: '2099-12-01', time: '14:00' });
      await expect(
        service.create({ patientId: 2, date: '2099-12-01', time: '14:00' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    }));
  });

  describe('remove', () => {
    it('throws NotFoundException for non-existent appointment', inOrg(async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    }));

    it('removes an existing appointment', inOrg(async () => {
      const appointment = { id: 10, date: '2099-12-01', time: '13:00' };
      mockRepo.findOne.mockResolvedValueOnce(appointment);
      await service.remove(10);
      expect(mockRepo.remove).toHaveBeenCalledWith(appointment);
    }));
  });

  describe('getAvailability', () => {
    it('returns slots with available flag and decrypted rut', inOrg(async () => {
      const kms = (service as unknown as { kms: import('../kms/kms.service').KmsService }).kms;
      const encryptedRut = await kms.encrypt('12345678-9', 'Patient.rut:1', '1');
      mockRepo.find.mockResolvedValueOnce([
        {
          time: '13:00',
          patient: { id: 1, firstName: 'Ana', lastName: 'Garcia', rut: encryptedRut },
        },
      ]);

      const result = await service.getAvailability('2099-12-01');

      expect(result.length).toBeGreaterThan(0);
      const bookedSlot = result.find((s) => s.time === '13:00');
      expect(bookedSlot.available).toBe(false);
      expect(bookedSlot.patient).toBeDefined();
      expect(bookedSlot.patient.firstName).toBe('Ana');
      expect(bookedSlot.patient.rut).toBe('12345678-9');

      const freeSlot = result.find((s) => s.time === '14:00');
      expect(freeSlot.available).toBe(true);
      expect(freeSlot.patient).toBeNull();
    }));
  });

  describe('findByPatient', () => {
    it('decrypts curacion.observations on appointments returned for patient detail', inOrg(async () => {
      const kms = (service as unknown as { kms: import('../kms/kms.service').KmsService }).kms;
      const obs1 = await kms.encrypt('cura observada A', 'Curacion.observations:101', '1');
      const obs2 = await kms.encrypt('cura observada B', 'Curacion.observations:102', '1');

      mockRepo.find.mockResolvedValueOnce([
        {
          id: 1,
          patientId: 7,
          date: '2099-12-01',
          time: '13:00',
          curacion: { id: 101, observations: obs1 },
        },
        {
          id: 2,
          patientId: 7,
          date: '2099-12-02',
          time: '14:00',
          curacion: null,
        },
        {
          id: 3,
          patientId: 7,
          date: '2099-12-03',
          time: '15:00',
          curacion: { id: 102, observations: obs2 },
        },
      ]);

      const result = await service.findByPatient(7);

      expect(result).toHaveLength(3);
      expect(result[0].curacion!.observations as unknown as string).toBe('cura observada A');
      expect(result[1].curacion).toBeNull();
      expect(result[2].curacion!.observations as unknown as string).toBe('cura observada B');
    }));

    it('returns appointments with null observations untouched', inOrg(async () => {
      mockRepo.find.mockResolvedValueOnce([
        {
          id: 4,
          patientId: 7,
          date: '2099-12-04',
          time: '13:00',
          curacion: { id: 200, observations: null },
        },
      ]);

      const result = await service.findByPatient(7);

      expect(result[0].curacion!.observations).toBeNull();
    }));
  });

  describe('createLinked', () => {
    it('creates appointment linked to curacion', inOrg(async () => {
      const result = await service.createLinked(1, 5, '2099-12-01', '13:00');

      expect(result).toBeDefined();
      expect(mockRepo.create).toHaveBeenCalledWith({
        patientId: 1,
        curacionId: 5,
        date: '2099-12-01',
        time: '13:00',
      });
      expect(mockRepo.save).toHaveBeenCalled();
    }));

    it('rejects invalid slot for linked appointment', inOrg(async () => {
      await expect(
        service.createLinked(1, 5, '2099-12-01', '09:00'),
      ).rejects.toThrow(BadRequestException);
    }));

    it('rejects double-booked slot for linked appointment', inOrg(async () => {
      mockRepo.findOne.mockResolvedValueOnce({ id: 50 });
      await expect(
        service.createLinked(1, 5, '2099-12-01', '13:00'),
      ).rejects.toThrow(BadRequestException);
    }));
  });
});
