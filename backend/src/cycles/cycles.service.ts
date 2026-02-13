import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonthlyCycle } from './cycle.entity';
import { UpsertCycleDto } from './cycle.dto';

@Injectable()
export class CyclesService {
  constructor(
    @InjectRepository(MonthlyCycle)
    private readonly cycleRepo: Repository<MonthlyCycle>,
  ) {}

  async getCyclesByYear(year: number): Promise<MonthlyCycle[]> {
    return this.cycleRepo.find({
      where: { year },
      order: { month: 'ASC' },
    });
  }

  async getCycle(year: number, month: number): Promise<MonthlyCycle | null> {
    return this.cycleRepo.findOne({ where: { year, month } });
  }

  /**
   * Obtiene las fechas reales del ciclo para un mes.
   * Si no hay ciclo configurado, usa el mes calendario completo.
   */
  async getEffectiveDates(
    year: number,
    month: number,
  ): Promise<{ startDate: string; endDate: string }> {
    const cycle = await this.getCycle(year, month);
    if (cycle) {
      return { startDate: cycle.startDate, endDate: cycle.endDate };
    }
    // Fallback: mes calendario completo
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }

  async upsertCycle(dto: UpsertCycleDto): Promise<MonthlyCycle> {
    const existing = await this.cycleRepo.findOne({
      where: { year: dto.year, month: dto.month },
    });
    if (existing) {
      existing.startDate = dto.startDate;
      existing.endDate = dto.endDate;
      return this.cycleRepo.save(existing);
    }
    const cycle = this.cycleRepo.create(dto);
    return this.cycleRepo.save(cycle);
  }

  async bulkUpsert(cycles: UpsertCycleDto[]): Promise<MonthlyCycle[]> {
    const results: MonthlyCycle[] = [];
    for (const dto of cycles) {
      results.push(await this.upsertCycle(dto));
    }
    return results;
  }

  /**
   * Genera ciclos automáticos para un año completo.
   * Cada ciclo empieza el día siguiente al fin del ciclo anterior.
   */
  async generateYearCycles(
    year: number,
    configs: { month: number; endDate: string }[],
  ): Promise<MonthlyCycle[]> {
    // Ordenar por mes
    const sorted = [...configs].sort((a, b) => a.month - b.month);
    const results: MonthlyCycle[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const config = sorted[i];
      let startDate: string;

      if (i === 0) {
        // El primer ciclo del año: empieza el día después del fin del ciclo de diciembre del año anterior
        const prevCycle = await this.getCycle(year - 1, 12);
        if (prevCycle) {
          const d = new Date(prevCycle.endDate + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          startDate = d.toISOString().split('T')[0];
        } else {
          startDate = `${year}-01-01`;
        }
      } else {
        // Empieza el día después del fin del ciclo anterior
        const prevEnd = sorted[i - 1].endDate;
        const d = new Date(prevEnd + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        startDate = d.toISOString().split('T')[0];
      }

      const result = await this.upsertCycle({
        year,
        month: config.month,
        startDate,
        endDate: config.endDate,
      });
      results.push(result);
    }

    return results;
  }
}
