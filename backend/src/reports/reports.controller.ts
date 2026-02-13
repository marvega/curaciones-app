import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  async getMonthlyReport(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.reportsService.getMonthlyReport(
      parseInt(year, 10),
      parseInt(month, 10),
    );
  }

  @Get('detailed')
  async getDetailedReport(
    @Query('year') year?: string,
    @Query('quarter') quarter?: string,
    @Query('gender') gender?: string,
    @Query('ageMin') ageMin?: string,
    @Query('ageMax') ageMax?: string,
  ) {
    return this.reportsService.getDetailedReport({
      year: year ? parseInt(year, 10) : undefined,
      quarter: quarter ? parseInt(quarter, 10) : undefined,
      gender: gender || undefined,
      ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
      ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
    });
  }
}
