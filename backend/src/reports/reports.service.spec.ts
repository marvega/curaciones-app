import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { Curacion } from '../curaciones/curacion.entity';
import { Patient } from '../patients/patient.entity';
import { CyclesService } from '../cycles/cycles.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockGetRawMany = jest.fn();
  const mockDetailedGetRawMany = jest.fn();

  const mockCuracionRepo = {
    createQueryBuilder: jest.fn(),
  };

  function createMonthlyQb() {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: mockGetRawMany,
    };
    mockCuracionRepo.createQueryBuilder.mockReturnValueOnce(qb);
    return qb;
  }

  const mockPatientRepo = {};

  const mockCyclesService = {
    getEffectiveDates: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Curacion), useValue: mockCuracionRepo },
        { provide: getRepositoryToken(Patient), useValue: mockPatientRepo },
        { provide: CyclesService, useValue: mockCyclesService },
      ],
    }).compile();
    service = module.get(ReportsService);
    jest.clearAllMocks();
  });

  describe('getMonthlyReport', () => {
    it('returns counts by type', async () => {
      mockCyclesService.getEffectiveDates.mockResolvedValueOnce({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      mockGetRawMany.mockResolvedValueOnce([
        { type: 'avanzada', total: '5' },
        { type: 'pie_diabetico', total: '3' },
        { type: 'ulcera_venosa', total: '2' },
      ]);

      createMonthlyQb();

      const result = await service.getMonthlyReport(2026, 3);

      expect(result).toEqual({
        year: 2026,
        month: 3,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        avanzada: 5,
        pie_diabetico: 3,
        ulcera_venosa: 2,
        totalGeneral: 10,
      });
    });

    it('uses effective dates from cycles service', async () => {
      mockCyclesService.getEffectiveDates.mockResolvedValueOnce({
        startDate: '2026-02-26',
        endDate: '2026-03-25',
      });

      mockGetRawMany.mockResolvedValueOnce([]);
      createMonthlyQb();

      const result = await service.getMonthlyReport(2026, 3);

      expect(mockCyclesService.getEffectiveDates).toHaveBeenCalledWith(2026, 3);
      expect(result.startDate).toBe('2026-02-26');
      expect(result.endDate).toBe('2026-03-25');
      expect(result.totalGeneral).toBe(0);
    });
  });

  describe('getDetailedReport', () => {
    function setupDetailedQueryBuilder() {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: mockDetailedGetRawMany,
      };
      mockCuracionRepo.createQueryBuilder.mockReturnValueOnce(qb);
      return qb;
    }

    it('applies quarter filter using cycle dates', async () => {
      const qb = setupDetailedQueryBuilder();
      mockCyclesService.getEffectiveDates
        .mockResolvedValueOnce({ startDate: '2026-01-01', endDate: '2026-01-31' })
        .mockResolvedValueOnce({ startDate: '2026-03-01', endDate: '2026-03-31' });
      mockDetailedGetRawMany.mockResolvedValueOnce([]);

      await service.getDetailedReport({ year: 2026, quarter: 1 });

      expect(mockCyclesService.getEffectiveDates).toHaveBeenCalledWith(2026, 1);
      expect(mockCyclesService.getEffectiveDates).toHaveBeenCalledWith(2026, 3);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.date >= :startDate AND c.date <= :endDate',
        { startDate: '2026-01-01', endDate: '2026-03-31' },
      );
    });

    it('applies gender filter', async () => {
      const qb = setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([]);

      await service.getDetailedReport({ gender: 'F' });

      expect(qb.andWhere).toHaveBeenCalledWith('p.gender = :gender', { gender: 'F' });
    });

    it('groups avanzada and pie_diabetico together', async () => {
      setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([
        { type: 'avanzada', total: '4', gender: 'F' },
        { type: 'pie_diabetico', total: '2', gender: 'F' },
        { type: 'ulcera_venosa', total: '3', gender: 'M' },
      ]);

      const result = await service.getDetailedReport({});

      expect(result.summary.avanzada.total).toBe(6); // 4 + 2
      expect(result.summary.avanzada.byGender['F']).toBe(6);
      expect(result.summary.ulcera_venosa.total).toBe(3);
      expect(result.summary.ulcera_venosa.byGender['M']).toBe(3);
    });
  });
});
