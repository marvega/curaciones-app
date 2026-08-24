export interface McpError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface HttpResult {
  status: number;
  body: unknown;
  retryAfter?: string;
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as any).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join('; ');
  }
  return fallback;
}

export function mapHttpToMcp(r: HttpResult): McpError {
  if (r.status === 401) {
    return { code: -32600, message: 'Invalid or expired token; re-authorize the connection.', data: { error: 'invalid_token' } };
  }
  if (r.status === 403) {
    return { code: -32600, message: extractMessage(r.body, 'Permission denied'), data: { error: 'forbidden' } };
  }
  if (r.status === 404) {
    return { code: -32602, message: extractMessage(r.body, 'Resource not found'), data: { error: 'not_found' } };
  }
  if (r.status === 400 || r.status === 409 || r.status === 422) {
    return { code: -32602, message: extractMessage(r.body, 'Invalid input') };
  }
  if (r.status === 429) {
    return { code: -32603, message: 'Rate limited', data: { error: 'rate_limited', retryAfter: r.retryAfter } };
  }
  // 5xx and anything else
  return { code: -32603, message: 'Internal server error' };
}
