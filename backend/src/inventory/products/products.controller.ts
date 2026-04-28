import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ProductsService } from './products.service';
import { ExcelImportService } from './excel-import.service';
import { CreateProductDto, ProductCodeDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';
import { ProductType } from './product.entity';

@ApiTags('Inventory / Products')
@ApiBearerAuth()
@Controller('api/inventory/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly importer: ExcelImportService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('type') type?: ProductType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.list({
      search,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.products.findById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post(':id/codes')
  @Roles('admin')
  addCode(@Param('id', ParseIntPipe) id: number, @Body() dto: ProductCodeDto) {
    return this.products.addCode(id, dto);
  }

  @Delete('codes/:codeId')
  @Roles('admin')
  async removeCode(@Param('codeId', ParseIntPipe) codeId: number) {
    await this.products.removeCode(codeId);
    return { ok: true };
  }

  @Post('import')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Query('sheet') sheet?: string,
  ) {
    if (!file?.buffer) throw new BadRequestException('Missing file');
    return this.importer.import(file.buffer, sheet ?? 'PRODUCTOS AVIS');
  }
}
