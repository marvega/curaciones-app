import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WoundPhoto } from './wound-photo.entity';
import { WoundPhotosController } from './wound-photos.controller';
import { WoundPhotosService } from './wound-photos.service';

@Module({
  imports: [TypeOrmModule.forFeature([WoundPhoto])],
  controllers: [WoundPhotosController],
  providers: [WoundPhotosService],
})
export class WoundPhotosModule {}
