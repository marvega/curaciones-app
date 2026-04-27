import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { Patient } from '../patients/patient.entity';
import { CyclesService } from '../cycles/cycles.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    private readonly cyclesService: CyclesService,
  ) {}

  async getMonthlyReport(year: number, month: number) {
    // Usar ciclo configurado o fallback a mes calendario
    const { startDate, endDate } = await this.cyclesService.getEffectiveDates(
      year,
      month,
    );

    // endDate es inclusivo, así que usamos <= en vez de <
    const results = await this.curacionRepo
      .createQueryBuilder('c')
      .select('c.type', 'type')
      .addSelect('COUNT(*)', 'total')
      .where('c.date >= :startDate AND c.date <= :endDate', {
        startDate,
        endDate,
      })
      .groupBy('c.type')
      .getRawMany();

    const summary = {
      avanzada: 0,
      pie_diabetico: 0,
      ulcera_venosa: 0,
    };

    for (const row of results) {
      summary[row.type] = parseInt(row.total, 10);
    }

    return {
      year,
      month,
      startDate,
      endDate,
      ...summary,
      totalGeneral: summary.avanzada + summary.pie_diabetico + summary.ulcera_venosa,
    };
  }

  async getDetailedReport(filters: {
    year?: number;
    quarter?: number;
    gender?: string;
    ageMin?: number;
    ageMax?: number;
  }) {
    const qb = this.curacionRepo
      .createQueryBuilder('c')
      .innerJoin('c.patient', 'p')
      .select('p.gender', 'gender')
      .addSelect('COUNT(DISTINCT c.patientId)', 'total')
      .where('c.type = :type', { type: 'pie_diabetico' });

    await this.applyDetailedFilters(qb, filters);

    const results = await qb.groupBy('p.gender').getRawMany();

    const byGender: Record<string, number> = {};
    let total = 0;
    for (const row of results) {
      const count = parseInt(row.total, 10);
      byGender[row.gender] = count;
      total += count;
    }

    return {
      filters,
      total,
      byGender,
    };
  }

  private async applyDetailedFilters(
    qb: SelectQueryBuilder<Curacion>,
    filters: {
      year?: number;
      quarter?: number;
      gender?: string;
      ageMin?: number;
      ageMax?: number;
    },
  ): Promise<void> {
    if (filters.year && filters.quarter) {
      const startMonth = (filters.quarter - 1) * 3 + 1;
      const endMonth = filters.quarter * 3;

      const startCycle = await this.cyclesService.getEffectiveDates(
        filters.year,
        startMonth,
      );
      const endCycle = await this.cyclesService.getEffectiveDates(
        filters.year,
        endMonth,
      );

      qb.andWhere('c.date >= :startDate AND c.date <= :endDate', {
        startDate: startCycle.startDate,
        endDate: endCycle.endDate,
      });
    }

    if (filters.gender) {
      qb.andWhere('p.gender = :gender', { gender: filters.gender });
    }

    if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
      if (filters.ageMax !== undefined) {
        const minBirthDate = new Date();
        minBirthDate.setFullYear(
          minBirthDate.getFullYear() - filters.ageMax - 1,
        );
        qb.andWhere('p.birthDate >= :minBirth', {
          minBirth: minBirthDate.toISOString().split('T')[0],
        });
      }

      if (filters.ageMin !== undefined) {
        const maxBirthDate = new Date();
        maxBirthDate.setFullYear(
          maxBirthDate.getFullYear() - filters.ageMin,
        );
        qb.andWhere('p.birthDate <= :maxBirth', {
          maxBirth: maxBirthDate.toISOString().split('T')[0],
        });
      }
    }
  }
}
