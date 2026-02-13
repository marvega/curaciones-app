import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Curacion } from './curacion.entity';
import { CuracionesService } from './curaciones.service';
import { CuracionesController } from './curaciones.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Curacion])],
  controllers: [CuracionesController],
  providers: [CuracionesService],
  exports: [CuracionesService],
})
export class CuracionesModule {}
