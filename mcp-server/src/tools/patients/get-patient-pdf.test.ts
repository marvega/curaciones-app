import { describe, it, expect, vi } from 'vitest';
import { getPatientPdfHandler } from './get-patient-pdf.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:read', org_id: '1', exp: 9999999999 };

function mockBackend(binaryResponse: any): BackendClient {
  return {
    request: vi.fn(),
    requestBinary: vi.fn().mockResolvedValue(binaryResponse),
  };
}

describe('get_patient_pdf', () => {
  it('returns PDF as base64-encoded resource', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const backend = mockBackend({
      status: 200,
      contentType: 'application/pdf',
      data: pdfBytes,
    });
    const result = await getPatientPdfHandler({ id: 7 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('resource');
    expect(result.content[0].mimeType).toBe('application/pdf');
    expect(result.content[0].data).toBe(Buffer.from(pdfBytes).toString('base64'));
    expect(backend.requestBinary).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/patients/7/pdf',
    }));
  });

  it('maps 404 to not_found error', async () => {
    const backend = mockBackend({ status: 404, contentType: '', data: new Uint8Array() });
    const result = await getPatientPdfHandler({ id: 999 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
