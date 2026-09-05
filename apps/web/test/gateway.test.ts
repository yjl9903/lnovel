import { describe, expect, it, vi } from 'vitest';
import { createGateway } from '../src/server/gateway';
import { createApiRequest } from '../src/server/api-request';

const paths = [
  '/health',
  '/bili',
  '/bili/',
  '/bili/contexts',
  '/bili/wenku?sort=lastupdate',
  '/bili/top/weekvisit',
  '/bili/novels',
  '/bili/novel/1',
  '/bili/novel/1/vol/2',
  '/bili/novel/1/chapter/3',
  '/bili/novels/feed.xml',
  '/bili/wenku/feed.xml',
  '/bili/top/weekvisit/feed.xml',
  '/bili/novel/1/feed.xml',
  '/bili/novel/1/vol/2/feed.xml',
  '/bili/files/cover.jpg',
  '/bili/img3/cover.jpg',
  '/bili/missing'
];

describe('web gateway', () => {
  it.each(paths)('forwards %s without rewriting the request or response', async (path) => {
    const response = new Response('unchanged', {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml',
        'Cache-Control': 'public, max-age=86400',
        ETag: '"original"',
        'X-Request-Id': 'request-id',
        'X-Response-Timestamp': '2026-01-01'
      }
    });
    const apiFetch = vi.fn(() => response);
    const startFetch = vi.fn(() => new Response('page'));
    const app = createGateway({ apiFetch, startFetch });
    const request = new Request(`https://public.example${path}`, {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'public.example',
        'if-none-match': '"old"'
      }
    });
    const actual = await app.fetch(request);
    expect(apiFetch).toHaveBeenCalledWith(request);
    expect(actual).toBe(response);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it.each([304, 404, 408, 500])('does not turn API status %s into a page', async (status) => {
    const app = createGateway({
      apiFetch: () => new Response(status === 304 ? null : 'error', { status }),
      startFetch: () => new Response('page')
    });
    expect((await app.request('/bili/novel/invalid')).status).toBe(status);
  });

  it('preserves POST bodies, method and cancellation', async () => {
    const controller = new AbortController();
    const request = new Request('https://example.test/bili/future?force=1', {
      method: 'POST',
      body: 'payload',
      signal: controller.signal
    });
    const app = createGateway({
      apiFetch: async (req) => {
        expect(req).toBe(request);
        expect(req.method).toBe('POST');
        expect(await req.text()).toBe('payload');
        controller.abort();
        expect(req.signal.aborted).toBe(true);
        return new Response(null, { status: 204 });
      },
      startFetch: () => new Response('page')
    });
    expect((await app.fetch(request)).status).toBe(204);
  });

  it.each(['/', '/old/page', '/_server/function', '/bilingual'])(
    'delegates %s to Start',
    async (path) => {
      const startFetch = vi.fn(() => new Response('page'));
      const app = createGateway({ apiFetch: vi.fn(), startFetch });
      expect(await (await app.request(path)).text()).toBe('page');
    }
  );
});

describe('SSR API request', () => {
  it('preserves identity and origin but excludes document cache and content headers', () => {
    const incoming = new Request('http://internal:3000/old/page', {
      headers: {
        cookie: 'session=abc',
        authorization: 'Bearer token',
        'x-forwarded-host': 'public.example',
        'x-forwarded-proto': 'https',
        'if-none-match': '"document"',
        'if-modified-since': 'yesterday',
        accept: 'text/html'
      }
    });
    const request = createApiRequest(incoming, '/bili/top/weekvisit');
    expect(request.url).toBe('http://internal:3000/bili/top/weekvisit');
    expect(Object.fromEntries(request.headers)).toEqual({
      accept: 'application/json',
      authorization: 'Bearer token',
      cookie: 'session=abc',
      'x-forwarded-host': 'public.example',
      'x-forwarded-proto': 'https'
    });
  });

  it('cancels when either the document or query is aborted', () => {
    const document = new AbortController();
    const query = new AbortController();
    const req = createApiRequest(
      new Request('https://example.test', { signal: document.signal }),
      '/bili/',
      query.signal
    );
    document.abort();
    expect(req.signal.aborted).toBe(true);
    const second = createApiRequest(new Request('https://example.test'), '/bili/', query.signal);
    query.abort();
    expect(second.signal.aborted).toBe(true);
  });
});
