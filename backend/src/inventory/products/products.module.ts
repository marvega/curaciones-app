import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductCode } from './product-code.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ExcelImportService } from './excel-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCode])],
  providers: [ProductsService, ExcelImportService],
  controllers: [ProductsController],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
