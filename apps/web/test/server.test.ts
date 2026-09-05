import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGateway } from '../src/server/gateway';
import { initializeLogging } from '@lnovel/server/logging';

const logRecords: any[] = [];
const logging = initializeLogging({
  level: 'debug',
  write: (line, done) => {
    logRecords.push(JSON.parse(line));
    done();
  }
});

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
  it('correlates real API response IDs with the outer request, including SSR calls', async () => {
    await logging.forceFlush();
    logRecords.length = 0;
    const ssr = createGateway({
      apiFetch: (request) => api.fetch(request),
      startFetch: () => api.request('/api/bili/novels')
    });
    const responses = await Promise.all([
      gateway.request('/api/bili/novels'),
      ssr.request('/page'),
      api.request('/api/bili/novels')
    ]);
    const ids = responses.map((response) => response.headers.get('x-request-id'));
    expect(new Set(ids).size).toBe(3);
    await logging.forceFlush();
    for (const [index, id] of ids.entries()) {
      expect(id).toBeTruthy();
      const events = logRecords.filter((record) => record.attributes.request_id === id);
      expect(
        events.filter((record) => record.attributes.event === 'http.request.completed')
      ).toHaveLength(1);
      expect(
        events.filter((record) => record.attributes.event === 'api.call.completed')
      ).toHaveLength(index < 2 ? 1 : 0);
    }
  });
  it.each([
    ['/health', 200],
    ['/api', 404],
    ['/api/unknown', 404],
    ['/api/bili/novels/feed.xml', 404],
    ['/api/bili/files/cover.jpg', 404],
    ['/api/bili/img3/cover.jpg', 404],
    ['/api/bili/', 200],
    ['/api/bili/contexts', 200],
    ['/api/bili/novels', 200],
    ['/api/bili/novel/invalid', 400],
    ['/api/bili/novel/1/vol/invalid', 400],
    ['/api/bili/novel/1/chapter/invalid', 400],
    ['/bili/novel/invalid/feed.xml', 400],
    ['/bili/novel/1/vol/invalid/feed.xml', 400],
    ['/api/bili/missing', 404]
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
    if (pathname === '/api/bili/contexts') {
      expect(forwarded.headers.get('cache-control')).toBe('no-store, no-cache, max-age=0');
    }
    expect(forwarded.headers.get('x-request-id')).toBeTruthy();
    expect(forwarded.headers.get('x-response-timestamp')).toBeTruthy();
  });

  it('preserves conditional API requests', async () => {
    const first = await gateway.request('/api/bili/');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const conditional = await gateway.request('/api/bili/', {
      headers: { 'if-none-match': etag! }
    });
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
  });
});
