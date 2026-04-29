import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, DataSource } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';
import { AuditChainService } from './audit-chain.service';

interface LogEntry {
  userId: number;
  username: string;
  organizationId: string;
  establishmentId?: string | null;
  action: AuditAction;
  entity: string;
  entityId: number;
  payload?: Record<string, any> | null;
  beforeJson?: Record<string, any> | null;
  afterJson?: Record<string, any> | null;
  ipAddress?: string;
  userAgent?: string | null;
  requestId?: string | null;
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
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly chain: AuditChainService,
  ) {}

  async log(entry: LogEntry): Promise<AuditLog> {
    return this.dataSource.transaction(async (tx) => {
      const last = await tx.query(
        `SELECT "chainHash" FROM "audit_logs"
           WHERE "organizationId" = $1
           ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [entry.organizationId],
      );
      const prevHash: string | null = last[0]?.chainHash ?? null;
      const createdAt = new Date();
      const payloadHash = this.chain.computePayloadHash({
        userId: entry.userId,
        organizationId: entry.organizationId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson ?? null,
        afterJson: entry.afterJson ?? null,
        createdAt,
        requestId: entry.requestId ?? null,
      });
      const chainHash = this.chain.computeChainHash(prevHash, payloadHash);

      const row = tx.getRepository(AuditLog).create({
        userId: entry.userId,
        username: entry.username,
        organizationId: entry.organizationId,
        establishmentId: entry.establishmentId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        payload: entry.payload ?? null,
        beforeJson: entry.beforeJson ?? null,
        afterJson: entry.afterJson ?? null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
        payloadHash,
        prevHash,
        chainHash,
        createdAt,
      });
      return tx.getRepository(AuditLog).save(row);
    });
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
