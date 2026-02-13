import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { CyclesService } from './cycles.service';
import { UpsertCycleDto } from './cycle.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/cycles')
@UseGuards(JwtAuthGuard)
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Get()
  async getCycles(@Query('year') year: string) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    return this.cyclesService.getCyclesByYear(y);
  }

  @Get('effective')
  async getEffectiveDates(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    return this.cyclesService.getEffectiveDates(y, m);
  }

  @Post()
  async upsertCycle(@Body() dto: UpsertCycleDto) {
    return this.cyclesService.upsertCycle(dto);
  }

  @Post('bulk')
  async bulkUpsert(@Body() body: { cycles: UpsertCycleDto[] }) {
    return this.cyclesService.bulkUpsert(body.cycles);
  }
}
