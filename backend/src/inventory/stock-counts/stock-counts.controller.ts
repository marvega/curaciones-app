import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { StockCountsService } from './stock-counts.service';
import { StockCountStatus } from './stock-count.entity';

@ApiTags('Inventory / StockCounts')
@ApiBearerAuth()
@Controller('api/inventory/stock-counts')
@UseGuards(JwtAuthGuard)
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @Get()
  list(@Query('establishmentId') establishmentId?: string, @Query('status') status?: StockCountStatus) {
    return this.counts.list({
      establishmentId: establishmentId ? parseInt(establishmentId, 10) : undefined,
      status,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.counts.findById(id);
  }

  @Post()
  open(@Body() dto: { establishmentId: number; countDate?: string }, @Req() req: any) {
    const date = dto.countDate ?? new Date().toISOString().slice(0, 10);
    return this.counts.openOrCreate(dto.establishmentId, date, req.user.id);
  }

  @Patch(':id/lots/:lotId')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Param('lotId', ParseIntPipe) lotId: number,
    @Body() dto: { absoluteValue: number; notes?: string },
    @Req() req: any,
  ) {
    return this.counts.upsertEntry(id, lotId, dto, req.user.id);
  }

  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.counts.close(id);
  }
}
