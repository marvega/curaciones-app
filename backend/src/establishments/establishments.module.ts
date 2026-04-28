import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { EstablishmentsService } from './establishments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment])],
  providers: [EstablishmentsService],
  exports: [EstablishmentsService, TypeOrmModule],
})
export class EstablishmentsModule {}
