import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CanastaService } from './canasta.service';
import { CanastaImportService } from './canasta-import.service';
import { CanastaSection } from './canasta-category.entity';

@ApiTags('Inventory / Canasta')
@ApiBearerAuth()
@Controller('api/inventory/canasta')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CanastaController {
  constructor(
    private readonly canasta: CanastaService,
    private readonly importer: CanastaImportService,
  ) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.canasta.list(includeArchived === 'true');
  }

  @Put(':id/products')
  @Roles('admin')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: { productIds: number[] }) {
    return this.canasta.replaceProducts(id, dto.productIds);
  }

  @Post('categories')
  @Roles('admin')
  create(
    @Body()
    dto: {
      name: string;
      section: CanastaSection;
      displayOrder?: number;
      isOptional?: boolean;
      notes?: string;
    },
  ) {
    return this.canasta.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles('admin')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: Partial<{
      name: string;
      section: CanastaSection;
      displayOrder: number;
      isOptional: boolean;
      notes: string | null;
      archived: boolean;
    }>,
  ) {
    return this.canasta.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.canasta.deleteCategory(id);
  }

  @Post('import')
  @Roles('admin')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async import(@UploadedFile() file: Express.Multer.File, @Body('sheet') sheet?: string) {
    if (!file) {
      return { error: 'file required' };
    }
    return this.importer.importFromXlsx(file.buffer, sheet);
  }
}
