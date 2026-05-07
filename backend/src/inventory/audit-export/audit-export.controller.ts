import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MultiAuthGuard } from '../../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../../oauth/decorators/required-scopes.decorator';
import { AuditExportService } from './audit-export.service';

@ApiTags('Inventory / AuditExport')
@ApiBearerAuth()
@Controller('api/inventory/audit-export')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class AuditExportController {
  constructor(private readonly svc: AuditExportService) {}

  @RequiredScopes('inventory:read')
  @Get()
  async export(
    @Query('mode') mode: 'current' | 'month',
    @Query('establishmentId') establishmentId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    const estId = parseInt(establishmentId ?? '1', 10);
    let snapshotDate: Date;
    if (mode === 'month') {
      if (!year || !month) throw new BadRequestException('year and month required');
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      snapshotDate = new Date(y, m, 0); // last day of month
    } else {
      snapshotDate = new Date();
    }
    const report = await this.svc.computeReport(estId, snapshotDate);
    const buffer = await this.svc.generateExcel(report);
    const filename = `canasta-curacion-avanzada-${report.snapshotDate}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
