import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';

interface LogEntry {
  userId: number;
  username: string;
  action: AuditAction;
  entity: string;
  entityId: number;
  payload?: Record<string, any>;
  ipAddress?: string;
}

interface FindAllOptions {
  page: number;
  limit: number;
  entity?: string;
  entityId?: number;
  userId?: number;
  from?: string;
  to?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(entry: LogEntry): Promise<AuditLog> {
    const log = this.auditLogRepo.create(entry);
    return this.auditLogRepo.save(log);
  }

  async findAll(options: FindAllOptions) {
    const where: FindOptionsWhere<AuditLog> = {};

    if (options.entity) where.entity = options.entity;
    if (options.entityId) where.entityId = options.entityId;
    if (options.userId) where.userId = options.userId;
    if (options.from && options.to) {
      where.createdAt = Between(new Date(options.from), new Date(options.to + 'T23:59:59'));
    }

    const [data, total] = await this.auditLogRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });

    return {
      data,
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }
}
