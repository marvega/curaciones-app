import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { CanastaService } from './canasta.service';
import { CanastaController } from './canasta.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [TypeOrmModule.forFeature([CanastaCategory]), ProductsModule],
  providers: [CanastaService],
  controllers: [CanastaController],
  exports: [CanastaService, TypeOrmModule],
})
export class CanastaModule {}
