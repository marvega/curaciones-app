import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MultiAuthGuard } from '../../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../../oauth/decorators/required-scopes.decorator';
import { StockCountsService } from './stock-counts.service';
import { StockCountStatus } from './stock-count.entity';

@ApiTags('Inventory / StockCounts')
@ApiBearerAuth()
@Controller('api/inventory/stock-counts')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @RequiredScopes('inventory:read')
  @Get()
  list(@Query('establishmentId') establishmentId?: string, @Query('status') status?: StockCountStatus) {
    return this.counts.list({
      establishmentId: establishmentId ? parseInt(establishmentId, 10) : undefined,
      status,
    });
  }

  @RequiredScopes('inventory:read')
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.counts.findById(id);
  }

  @RequiredScopes('inventory:write')
  @Post()
  open(@Body() dto: { establishmentId: number; countDate?: string }, @Req() req: any) {
    const date = dto.countDate ?? new Date().toISOString().slice(0, 10);
    return this.counts.openOrCreate(dto.establishmentId, date, req.user.id);
  }

  @RequiredScopes('inventory:write')
  @Patch(':id/lots/:lotId')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Param('lotId', ParseIntPipe) lotId: number,
    @Body() dto: { absoluteValue: number; notes?: string },
    @Req() req: any,
  ) {
    return this.counts.upsertEntry(id, lotId, dto, req.user.id);
  }

  @RequiredScopes('inventory:write')
  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.counts.close(id);
  }
}
