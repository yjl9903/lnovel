import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLogger, getLogContext, initializeLogging, requestLogging } from '../src/logging';

const records: any[] = [];
const runtime = initializeLogging({
  level: 'debug',
  write: (line, done) => {
    records.push(JSON.parse(line));
    done();
  }
});
beforeEach(async () => {
  await runtime.forceFlush();
  records.length = 0;
});

function apiApp() {
  const api = new Hono();
  api.use('*', requestLogging('api'));
  api.get('*', async (c) => {
    await Promise.resolve();
    createLogger('business').info('Handling API', { event: 'api.handling' });
    c.header('X-Request-Id', getLogContext().request_id!);
    return c.json({ request_id: getLogContext().request_id });
  });
  return api;
}

describe('request logging', () => {
  it('isolates concurrent external requests and reuses IDs through SSR and in-memory API calls', async () => {
    const api = apiApp();
    const gateway = new Hono();
    gateway.use('*', requestLogging('web'));
    gateway.get('/ssr', async (c) => {
      const outer = getLogContext().request_id;
      const result = await api.request('/data');
      const inner = await result.json();
      expect(inner.request_id).toBe(outer);
      expect(result.headers.get('x-request-id')).toBe(outer);
      return c.json({ request_id: outer });
    });
    gateway.get('/api/bili', (c) => api.fetch(c.req.raw));
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        gateway.request(index % 2 ? '/api/bili' : '/ssr', {
          headers: { 'X-Request-Id': 'untrusted' }
        })
      )
    );
    const ids = await Promise.all(
      responses.map(async (response) => (await response.json()).request_id)
    );
    expect(new Set(ids).size).toBe(8);
    expect(ids).not.toContain('untrusted');
    await runtime.forceFlush();
    for (const id of ids) {
      const events = records.filter((record) => record.attributes.request_id === id);
      expect(
        events.filter((record) => record.attributes.event === 'http.request.completed')
      ).toHaveLength(1);
      expect(
        events.filter((record) => record.attributes.event === 'api.call.completed')
      ).toHaveLength(1);
      expect(events.filter((record) => record.attributes.event === 'api.handling')).toHaveLength(1);
    }
    expect(getLogContext()).toEqual({});
  });

  it('logs a standalone API request as external and excludes URL queries and request headers', async () => {
    const api = apiApp();
    const response = await api.request('/data?token=private', {
      headers: { authorization: 'Bearer secret', cookie: 'secret' }
    });
    await runtime.forceFlush();
    const completion = records.find(
      (record) => record.attributes.event === 'http.request.completed'
    );
    expect(completion.attributes).toMatchObject({
      pathname: '/data',
      method: 'GET',
      status: 200,
      request_id: response.headers.get('x-request-id')
    });
    expect(completion.attributes.duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(records)).not.toMatch(/private|Bearer|cookie/);
  });

  it('uses final response statuses, including handled errors and low-noise successful assets', async () => {
    const app = new Hono<{ Variables: { logStaticAsset: boolean } }>();
    app.use('*', requestLogging('web'));
    app.get('/health', (c) => c.text('ok'));
    app.get('/assets/test.css', (c) => {
      c.set('logStaticAsset', true);
      return c.text('css');
    });
    app.get('/bad', (c) => c.text('bad', 400));
    app.get('/error', () => {
      throw new Error('expected');
    });
    app.onError((_error, c) => c.text('failed', 500));
    for (const path of ['/health', '/assets/test.css', '/bad', '/error', '/missing'])
      await app.request(path);
    await runtime.forceFlush();
    const completions = records.filter(
      (record) => record.attributes.event === 'http.request.completed'
    );
    expect(completions.map((record) => [record.attributes.status, record.severity_text])).toEqual([
      [200, 'DEBUG'],
      [200, 'DEBUG'],
      [400, 'WARN'],
      [500, 'ERROR'],
      [404, 'WARN']
    ]);
  });
});
