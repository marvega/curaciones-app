import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CyclesService } from './cycles.service';
import { UpsertCycleDto } from './cycle.dto';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../oauth/decorators/required-scopes.decorator';

@ApiTags('Cycles')
@ApiBearerAuth()
@Controller('api/cycles')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @RequiredScopes('clinical:read')
  @Get()
  async getCycles(@Query('year') year: string) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    return this.cyclesService.getCyclesByYear(y);
  }

  @RequiredScopes('clinical:read')
  @Get('effective')
  async getEffectiveDates(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    return this.cyclesService.getEffectiveDates(y, m);
  }

  @RequiredScopes('clinical:write')
  @Post()
  async upsertCycle(@Body() dto: UpsertCycleDto) {
    return this.cyclesService.upsertCycle(dto);
  }

  @RequiredScopes('clinical:write')
  @Post('bulk')
  async bulkUpsert(@Body() body: { cycles: UpsertCycleDto[] }) {
    return this.cyclesService.bulkUpsert(body.cycles);
  }
}
