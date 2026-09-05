import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGateway } from '../src/server/gateway';

const directory = await mkdtemp(path.join(os.tmpdir(), 'lnovel-web-api-'));
process.env.DATABASE_FILE = path.join(directory, 'test.db');
const { createApp } = await import('@lnovel/server');
const api = createApp();
const gateway = createGateway({
  apiFetch: (request) => api.fetch(request),
  startFetch: () => new Response('page')
});
afterAll(() => rm(directory, { recursive: true, force: true }));

describe('existing API contract through web', () => {
  it.each([
    ['/health', 200],
    ['/bili/', 200],
    ['/bili/contexts', 200],
    ['/bili/novels', 200],
    ['/bili/novel/invalid', 400],
    ['/bili/novel/1/vol/invalid', 400],
    ['/bili/novel/1/chapter/invalid', 400],
    ['/bili/novel/invalid/feed.xml', 400],
    ['/bili/novel/1/vol/invalid/feed.xml', 400],
    ['/bili/missing', 404]
  ])('%s retains status %s, body and cache behavior', async (pathname, status) => {
    const url = `https://public.example${pathname}`;
    const direct = await api.fetch(new Request(url));
    const forwarded = await gateway.fetch(new Request(url));
    expect(forwarded.status).toBe(status);
    expect(forwarded.status).toBe(direct.status);
    expect(await forwarded.text()).toBe(await direct.text());
    for (const name of ['content-type', 'cache-control', 'etag']) {
      expect(forwarded.headers.get(name)).toBe(direct.headers.get(name));
    }
    expect(forwarded.headers.get('x-request-id')).toBeTruthy();
    expect(forwarded.headers.get('x-response-timestamp')).toBeTruthy();
  });

  it('preserves conditional API requests', async () => {
    const first = await gateway.request('/bili/');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const conditional = await gateway.request('/bili/', { headers: { 'if-none-match': etag! } });
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
  });
});
