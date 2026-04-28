import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lot } from '../lots/lot.entity';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';
import { CanastaModule } from '../canasta/canasta.module';
import { LotsModule } from '../lots/lots.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lot]), CanastaModule, LotsModule],
  providers: [AuditExportService],
  controllers: [AuditExportController],
})
export class AuditExportModule {}
