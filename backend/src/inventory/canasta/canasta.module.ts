import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { CanastaService } from './canasta.service';
import { CanastaImportService } from './canasta-import.service';
import { CanastaController } from './canasta.controller';
import { ProductsModule } from '../products/products.module';
import { Product } from '../products/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CanastaCategory, Product]), ProductsModule],
  providers: [CanastaService, CanastaImportService],
  controllers: [CanastaController],
  exports: [CanastaService, CanastaImportService, TypeOrmModule],
})
export class CanastaModule {}
