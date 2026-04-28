import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditExportService } from './audit-export.service';
import { CanastaService } from '../canasta/canasta.service';
import { LotsService } from '../lots/lots.service';
import { CanastaSection } from '../canasta/canasta-category.entity';
import { Lot } from '../lots/lot.entity';

describe('AuditExportService', () => {
  let service: AuditExportService;
  const canasta: any = { list: jest.fn() };
  const lots: any = { getCurrentStock: jest.fn() };
  const lotRepo: any = { find: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        AuditExportService,
        { provide: CanastaService, useValue: canasta },
        { provide: LotsService, useValue: lots },
        { provide: getRepositoryToken(Lot), useValue: lotRepo },
      ],
    }).compile();
    service = m.get(AuditExportService);
    jest.clearAllMocks();
  });

  it('marks SI when category has at least one non-expired lot with stock>0', async () => {
    canasta.list.mockResolvedValue([
      {
        id: 1,
        displayOrder: 1,
        name: 'Bacteriostáticos',
        section: CanastaSection.INSUMOS,
        isOptional: false,
        notes: 'x',
        products: [
          {
            id: 100,
            lots: [
              { id: 1, expiresAt: '2027-01-01' },
              { id: 2, expiresAt: '2026-01-01' },
            ],
          },
        ],
      },
    ]);
    lots.getCurrentStock.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].available).toBe(true);
  });

  it('marks NO when all lots are expired', async () => {
    canasta.list.mockResolvedValue([
      {
        id: 1,
        displayOrder: 1,
        name: 'X',
        section: CanastaSection.INSUMOS,
        isOptional: false,
        notes: null,
        products: [{ id: 100, lots: [{ id: 1, expiresAt: '2026-01-01' }] }],
      },
    ]);
    lots.getCurrentStock.mockResolvedValueOnce(10);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows[0].available).toBe(false);
  });

  it('AYUDAS_TECNICAS rows have available=null and externally-managed note', async () => {
    canasta.list.mockResolvedValue([
      {
        id: 12,
        displayOrder: 12,
        name: 'Botín',
        section: CanastaSection.AYUDAS_TECNICAS,
        isOptional: false,
        notes: null,
        products: [],
      },
    ]);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows[0].available).toBeNull();
    expect(report.rows[0].notes).toContain('kinesiología');
  });
});
