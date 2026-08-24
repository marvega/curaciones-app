import { randomUUID } from 'crypto';

export function correlationFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  const traceparent = headers['traceparent'];
  if (typeof traceparent === 'string') {
    const parts = traceparent.split('-');
    if (parts.length === 4 && parts[1] && parts[1].length === 32) return parts[1];
  }
  const xrid = headers['x-request-id'];
  if (typeof xrid === 'string' && xrid.length > 0) return xrid;
  return randomUUID();
}
