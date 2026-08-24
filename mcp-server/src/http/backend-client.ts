export interface BackendRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  bearer: string;
  correlationId: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export interface BackendResponse {
  status: number;
  body: unknown;
  contentType: string;
  raw?: ArrayBuffer;
}

export interface BackendClient {
  request(req: BackendRequest): Promise<BackendResponse>;
  requestBinary(req: BackendRequest): Promise<{ status: number; data: Uint8Array; contentType: string }>;
}

export interface BackendClientConfig {
  backendUrl: string;
  fetch?: typeof fetch;
}

export function createBackendClient(cfg: BackendClientConfig): BackendClient {
  const f = cfg.fetch ?? fetch;

  function buildUrl(path: string, query?: Record<string, string | undefined>) {
    const url = new URL(path, cfg.backendUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  return {
    async request(req: BackendRequest): Promise<BackendResponse> {
      const url = buildUrl(req.path, req.query);
      const init: any = {
        method: req.method,
        headers: {
          authorization: `Bearer ${req.bearer}`,
          'x-request-id': req.correlationId,
          accept: 'application/json',
        },
      };
      if (req.body !== undefined) {
        init.body = JSON.stringify(req.body);
        init.headers['content-type'] = 'application/json';
      }
      const res = await f(url, init);
      const ct = (res.headers.get?.('content-type') ?? (res.headers as any).get?.('content-type') ?? '') as string;
      let body: unknown;
      if (ct.includes('application/json')) {
        body = await res.json();
      } else {
        body = await res.text();
      }
      return { status: res.status, body, contentType: ct };
    },
    async requestBinary(req: BackendRequest) {
      const url = buildUrl(req.path, req.query);
      const res = await f(url, {
        method: req.method,
        headers: {
          authorization: `Bearer ${req.bearer}`,
          'x-request-id': req.correlationId,
        },
      });
      const ct = res.headers.get('content-type') ?? '';
      const data = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, data, contentType: ct };
    },
  };
}
