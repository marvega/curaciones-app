import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './appointment.entity';
import { BadRequestException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  const mockRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    findOne: jest.fn(() => Promise.resolve(null)),
    find: jest.fn(() => Promise.resolve([])),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(AppointmentsService);
    jest.clearAllMocks();
  });

  it('rejects an invalid time slot for a regular day', async () => {
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '09:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid PM slot for a regular day', async () => {
    const result = await service.create({
      patientId: 1,
      date: '2099-12-01',
      time: '13:00',
    });
    expect(result).toBeDefined();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('rejects a PM slot on a second Friday', async () => {
    // 2099-03-13 is the second Friday of March 2099
    await expect(
      service.create({ patientId: 1, date: '2099-03-13', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an AM slot on a second Friday', async () => {
    // 2099-03-13 is the second Friday of March 2099
    const result = await service.create({
      patientId: 1,
      date: '2099-03-13',
      time: '09:00',
    });
    expect(result).toBeDefined();
  });

  it('rejects a past date', async () => {
    await expect(
      service.create({ patientId: 1, date: '2020-01-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a double-booked slot', async () => {
    mockRepo.findOne.mockResolvedValueOnce({ id: 99, date: '2099-12-01', time: '13:00' });
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });
});
