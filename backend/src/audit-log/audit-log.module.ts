import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogController } from './audit-log.controller';
import { AuditChainService } from './audit-chain.service';
import { AuditEventInterceptor } from './audit-event.decorator';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogInterceptor, AuditChainService, AuditEventInterceptor],
  exports: [AuditLogService, AuditLogInterceptor, AuditChainService, AuditEventInterceptor],
})
export class AuditLogModule {}
