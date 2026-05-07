import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('api/reports')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequiredScopes('reports:read')
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

  @RequiredScopes('reports:read')
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
