import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WoundNote } from './wound-note.entity';
import { WoundNotesService } from './wound-notes.service';
import { WoundNotesController } from './wound-notes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WoundNote])],
  controllers: [WoundNotesController],
  providers: [WoundNotesService],
  exports: [WoundNotesService],
})
export class WoundNotesModule {}
