export interface EncryptedField {
  v: 1;
  k: string;   // base64 encrypted DEK (per org, returned by KMS)
  iv: string;  // base64 GCM nonce (12 bytes)
  c: string;   // base64 ciphertext
  t: string;   // base64 GCM auth tag (16 bytes)
  aad: string; // e.g. "Patient.rut:42"
}

export function isEncryptedField(value: unknown): value is EncryptedField {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).v === 1 &&
    typeof (value as any).k === 'string' &&
    typeof (value as any).iv === 'string' &&
    typeof (value as any).c === 'string' &&
    typeof (value as any).t === 'string' &&
    typeof (value as any).aad === 'string'
  );
}
