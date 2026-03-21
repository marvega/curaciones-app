import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CyclesService } from './cycles.service';
import { MonthlyCycle } from './cycle.entity';

describe('CyclesService', () => {
  let service: CyclesService;

  const mockCycleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CyclesService,
        { provide: getRepositoryToken(MonthlyCycle), useValue: mockCycleRepo },
      ],
    }).compile();
    service = module.get(CyclesService);
    jest.clearAllMocks();
  });

  describe('getCyclesByYear', () => {
    it('returns ordered cycles for a year', async () => {
      const cycles = [
        { id: 1, year: 2026, month: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
        { id: 2, year: 2026, month: 2, startDate: '2026-02-01', endDate: '2026-02-28' },
      ];
      mockCycleRepo.find.mockResolvedValueOnce(cycles);

      const result = await service.getCyclesByYear(2026);

      expect(mockCycleRepo.find).toHaveBeenCalledWith({
        where: { year: 2026 },
        order: { month: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].month).toBe(1);
    });
  });

  describe('getEffectiveDates', () => {
    it('returns cycle dates when configured', async () => {
      mockCycleRepo.findOne.mockResolvedValueOnce({
        id: 1,
        year: 2026,
        month: 3,
        startDate: '2026-02-26',
        endDate: '2026-03-25',
      });

      const result = await service.getEffectiveDates(2026, 3);

      expect(result).toEqual({
        startDate: '2026-02-26',
        endDate: '2026-03-25',
      });
    });

    it('falls back to calendar month when no cycle configured', async () => {
      mockCycleRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.getEffectiveDates(2026, 3);

      expect(result).toEqual({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
    });

    it('calculates correct last day for February (non-leap)', async () => {
      mockCycleRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.getEffectiveDates(2026, 2);

      expect(result).toEqual({
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });
    });

    it('calculates correct last day for February (leap year)', async () => {
      mockCycleRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.getEffectiveDates(2028, 2);

      expect(result).toEqual({
        startDate: '2028-02-01',
        endDate: '2028-02-29',
      });
    });
  });

  describe('upsertCycle', () => {
    it('creates new cycle when none exists', async () => {
      mockCycleRepo.findOne.mockResolvedValueOnce(null);
      mockCycleRepo.save.mockResolvedValueOnce({
        id: 1,
        year: 2026,
        month: 4,
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      });

      const dto = {
        year: 2026,
        month: 4,
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      };

      const result = await service.upsertCycle(dto);

      expect(mockCycleRepo.create).toHaveBeenCalledWith(dto);
      expect(mockCycleRepo.save).toHaveBeenCalled();
      expect(result.month).toBe(4);
    });

    it('updates existing cycle', async () => {
      const existing = {
        id: 1,
        year: 2026,
        month: 4,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      };
      mockCycleRepo.findOne.mockResolvedValueOnce({ ...existing });
      mockCycleRepo.save.mockResolvedValueOnce({
        ...existing,
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      });

      const dto = {
        year: 2026,
        month: 4,
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      };

      const result = await service.upsertCycle(dto);

      expect(mockCycleRepo.create).not.toHaveBeenCalled();
      expect(mockCycleRepo.save).toHaveBeenCalled();
      expect(result.startDate).toBe('2026-03-26');
    });
  });

  describe('bulkUpsert', () => {
    it('processes all cycles', async () => {
      // Each upsertCycle call does findOne + save
      mockCycleRepo.findOne.mockResolvedValue(null);
      mockCycleRepo.save.mockImplementation((entity) =>
        Promise.resolve({ id: Math.random(), ...entity }),
      );

      const cycles = [
        { year: 2026, month: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
        { year: 2026, month: 2, startDate: '2026-02-01', endDate: '2026-02-28' },
        { year: 2026, month: 3, startDate: '2026-03-01', endDate: '2026-03-31' },
      ];

      const result = await service.bulkUpsert(cycles);

      expect(result).toHaveLength(3);
      expect(mockCycleRepo.save).toHaveBeenCalledTimes(3);
    });
  });
});
