import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CanastaService } from './canasta.service';

@ApiTags('Inventory / Canasta')
@ApiBearerAuth()
@Controller('api/inventory/canasta')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CanastaController {
  constructor(private readonly canasta: CanastaService) {}

  @Get()
  list() {
    return this.canasta.list();
  }

  @Put(':id/products')
  @Roles('admin')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: { productIds: number[] }) {
    return this.canasta.replaceProducts(id, dto.productIds);
  }
}
