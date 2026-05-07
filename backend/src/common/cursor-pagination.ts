export interface CursorPayload {
  id: number;
  createdAt: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.id !== 'number' || typeof parsed.createdAt !== 'string') {
      throw new Error('invalid cursor: missing fields');
    }
    return parsed as CursorPayload;
  } catch (e) {
    throw new Error(`invalid cursor: ${(e as Error).message}`);
  }
}
