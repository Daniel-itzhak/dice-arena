import { vi } from 'vitest';

/** Install with `vi.stubGlobal('fetch', fetchMock)` and reset between tests. */
export const fetchMock = vi.fn<typeof fetch>();

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function respondWith(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
}

export interface SentRequest {
  url: string;
  method: string | undefined;
  authorization: string | null;
  body: unknown;
}

export function sentRequest(index = 0): SentRequest {
  const call = fetchMock.mock.calls[index];
  if (call === undefined) {
    throw new Error(`fetch was called ${fetchMock.mock.calls.length} time(s)`);
  }
  const [input, init] = call;
  return {
    url: String(input),
    method: init?.method,
    authorization: new Headers(init?.headers).get('Authorization'),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}
