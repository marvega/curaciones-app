import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogService } from './audit-log.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List audit logs with filters (admin only)' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: number,
    @Query('userId') userId?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditLogService.findAll({
      page: +page,
      limit: +limit,
      entity,
      entityId: entityId ? +entityId : undefined,
      userId: userId ? +userId : undefined,
      from,
      to,
    });
  }
}
