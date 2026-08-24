import { describe, it, expect } from 'vitest';
import { Writable } from 'stream';
import { createLogger } from './logger.js';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); },
  });
  return { stream, lines };
}

describe('logger redaction', () => {
  it('redacts rut from nested payload', () => {
    const { stream, lines } = captureLogs();
    const log = createLogger({ level: 'info', stream });
    log.info({ user: { rut: '11111111-1', firstName: 'Juan' } }, 'request');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.user.rut).toBe('[REDACTED]');
    expect(parsed.user.firstName).toBe('Juan');
  });

  it('redacts notes/observations/phone/email/address', () => {
    const { stream, lines } = captureLogs();
    const log = createLogger({ level: 'info', stream });
    log.info(
      {
        notes: 'sensitive',
        observations: 'sensitive',
        phone: '+56...',
        email: 'a@b.com',
        address: 'Calle 123',
      },
      'evt',
    );
    const parsed = JSON.parse(lines[0]);
    expect(parsed.notes).toBe('[REDACTED]');
    expect(parsed.observations).toBe('[REDACTED]');
    expect(parsed.phone).toBe('[REDACTED]');
    expect(parsed.email).toBe('[REDACTED]');
    expect(parsed.address).toBe('[REDACTED]');
  });
});
