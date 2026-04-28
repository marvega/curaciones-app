import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { LotsService } from './lots.service';
import { ReceptionDto } from './reception.dto';

@ApiTags('Inventory / Lots')
@ApiBearerAuth()
@Controller('api/inventory')
@UseGuards(JwtAuthGuard)
export class LotsController {
  constructor(private readonly lots: LotsService) {}

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

  @Get('lots/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.lots.findById(id);
  }

  @Post('lots/reception')
  reception(@Body() dto: ReceptionDto, @Req() req: any) {
    return this.lots.createReception(dto, req.user.id);
  }

  @Post('lots/:id/adjustments')
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { delta: number; notes?: string },
    @Req() req: any,
  ) {
    return this.lots.createAdjustment(id, dto, req.user.id);
  }

  @Get('expiring')
  expiring(@Query('days') days?: string, @Query('establishmentId') establishmentId?: string) {
    return this.lots.getExpiring(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('stock-snapshot')
  snapshot(@Query('establishmentId') establishmentId?: string, @Query('date') date?: string) {
    return this.lots.getStockSnapshot(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      date ? new Date(date) : undefined,
    );
  }
}
