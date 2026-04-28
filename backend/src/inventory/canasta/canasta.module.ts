import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { CanastaService } from './canasta.service';
import { CanastaController } from './canasta.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CanastaCategory])],
  providers: [CanastaService],
  controllers: [CanastaController],
  exports: [CanastaService, TypeOrmModule],
})
export class CanastaModule {}
