import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanastaService } from '../canasta/canasta.service';
import { LotsService } from '../lots/lots.service';
import { CanastaSection } from '../canasta/canasta-category.entity';
import { Lot } from '../lots/lot.entity';

export interface AuditRow {
  displayOrder: number;
  name: string;
  section: CanastaSection;
  isOptional: boolean;
  notes: string | null;
  available: boolean | null; // null for AYUDAS_TECNICAS
}

export interface AuditReport {
  snapshotDate: string;
  establishmentId: number;
  rows: AuditRow[];
}

@Injectable()
export class AuditExportService {
  constructor(
    private readonly canasta: CanastaService,
    private readonly lots: LotsService,
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
  ) {}

  async computeReport(establishmentId: number, snapshotDate: Date): Promise<AuditReport> {
    const categories = await this.canasta.list();
    const isoDate = snapshotDate.toISOString().slice(0, 10);
    const rows: AuditRow[] = [];

    for (const cat of categories) {
      if (cat.section === CanastaSection.AYUDAS_TECNICAS) {
        rows.push({
          displayOrder: cat.displayOrder,
          name: cat.name,
          section: cat.section,
          isOptional: cat.isOptional,
          notes: cat.notes ?? 'Gestión externa por kinesiología',
          available: null,
        });
        continue;
      }
      let available = false;
      for (const product of cat.products ?? []) {
        // Tests pass product.lots inline; production resolves lots via repo.
        const productLots =
          (product as any).lots ?? (await this.findLotsForProduct(product.id, establishmentId));
        for (const lot of productLots) {
          if (!lot.expiresAt || lot.expiresAt < isoDate) continue;
          const stock = await this.lots.getCurrentStock(lot.id, snapshotDate);
          if (stock > 0) {
            available = true;
            break;
          }
        }
        if (available) break;
      }
      rows.push({
        displayOrder: cat.displayOrder,
        name: cat.name,
        section: cat.section,
        isOptional: cat.isOptional,
        notes: cat.notes,
        available,
      });
    }
    return { snapshotDate: isoDate, establishmentId, rows };
  }

  private async findLotsForProduct(productId: number, establishmentId: number) {
    return this.lotRepo.find({ where: { productId, establishmentId } });
  }
}
