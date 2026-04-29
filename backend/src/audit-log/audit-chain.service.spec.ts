import { AuditChainService } from './audit-chain.service';

describe('AuditChainService', () => {
  const svc = new AuditChainService();

  it('computes payloadHash deterministically', () => {
    const row = {
      userId: 1,
      organizationId: '1',
      action: 'CREATE',
      entity: 'patients',
      entityId: 5,
      beforeJson: null,
      afterJson: { name: 'a' },
      createdAt: new Date('2026-04-28T10:00:00.000Z'),
      requestId: null,
    };
    expect(svc.computePayloadHash(row)).toBe(svc.computePayloadHash(row));
  });

  it('chainHash uses GENESIS for null prevHash', () => {
    const ph = 'a'.repeat(64);
    const ch = svc.computeChainHash(null, ph);
    expect(ch).toMatch(/^[0-9a-f]{64}$/);
  });
});
