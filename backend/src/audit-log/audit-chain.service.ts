import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface ChainableAuditRow {
  userId: number;
  organizationId: string;
  action: string;
  entity: string;
  entityId: number;
  beforeJson: Record<string, any> | null;
  afterJson: Record<string, any> | null;
  createdAt: Date;
  requestId: string | null;
}

@Injectable()
export class AuditChainService {
  private sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  computePayloadHash(row: ChainableAuditRow): string {
    return this.sha256(
      JSON.stringify({
        userId: row.userId,
        organizationId: row.organizationId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        beforeJson: row.beforeJson ?? null,
        afterJson: row.afterJson ?? null,
        createdAt: row.createdAt.toISOString(),
        requestId: row.requestId ?? null,
      }),
    );
  }

  computeChainHash(prevHash: string | null, payloadHash: string): string {
    return this.sha256((prevHash ?? 'GENESIS') + payloadHash);
  }
}
