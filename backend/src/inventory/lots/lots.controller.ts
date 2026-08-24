import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MultiAuthGuard } from '../../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../../oauth/guards/oauth-scope.guard';
import { RequiredScopes } from '../../oauth/decorators/required-scopes.decorator';
import { LotsService } from './lots.service';
import { ReceptionDto } from './reception.dto';

@ApiTags('Inventory / Lots')
@ApiBearerAuth()
@Controller('api/inventory')
@UseGuards(MultiAuthGuard, OAuthScopeGuard)
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @RequiredScopes('inventory:read')
  @Get('lots')
  list(
    @Query('productId') productId?: string,
    @Query('establishmentId') establishmentId?: string,
    @Query('expiringInDays') expiringInDays?: string,
    @Query('active') active?: string,
  ) {
    return this.lots.list({
      productId: productId ? parseInt(productId, 10) : undefined,
      establishmentId: establishmentId ? parseInt(establishmentId, 10) : undefined,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
      active: active === 'true',
    });
  }

  @RequiredScopes('inventory:read')
  @Get('lots/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.lots.findById(id);
  }

  @RequiredScopes('inventory:write')
  @Post('lots/reception')
  reception(@Body() dto: ReceptionDto, @Req() req: any) {
    return this.lots.createReception(dto, req.user.id);
  }

  @RequiredScopes('inventory:write')
  @Post('lots/:id/adjustments')
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { delta: number; notes?: string },
    @Req() req: any,
  ) {
    return this.lots.createAdjustment(id, dto, req.user.id);
  }

  @RequiredScopes('inventory:read')
  @Get('expiring')
  async expiring(@Query('days') days?: string, @Query('establishmentId') establishmentId?: string) {
    const lots = await this.lots.getExpiring(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      days ? parseInt(days, 10) : 30,
    );
    return { lots, total: lots.length };
  }

  @RequiredScopes('inventory:read')
  @Get('stock-snapshot')
  snapshot(@Query('establishmentId') establishmentId?: string, @Query('date') date?: string) {
    return this.lots.getStockSnapshot(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      date ? new Date(date) : undefined,
    );
  }
}
