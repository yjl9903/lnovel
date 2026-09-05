import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogging,
  initializeLogging,
  getLogContext,
  withLogContext,
  consoleLogger,
  installProcessHandlers,
  safeUrl
} from '../src/logging';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('OTel JSON logging', () => {
  it('adapts console-style library calls without changing global console', async () => {
    const lines: string[] = [];
    const runtime = createLogging({
      write: (line, done) => {
        lines.push(line);
        done();
      }
    });
    const original = console.log;
    const adapter = consoleLogger(runtime.createLogger('library'));
    adapter.log('Fetched %s', 'chapter');
    adapter.error('Failed fetching', new Error('timeout'));
    const badValue = {
      [Symbol.for('nodejs.util.inspect.custom')]() {
        throw new Error('bad formatter');
      }
    };
    expect(() => adapter.log(badValue)).not.toThrow();
    await runtime.forceFlush();
    expect(JSON.parse(lines[0]).body).toBe('Fetched chapter');
    expect(JSON.parse(lines[1]).attributes['exception.message']).toBe('timeout');
    expect(console.log).toBe(original);
    await runtime.shutdown();
  });
  it('exports one JSON record per event with resource, severity and safe error attributes', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'test-service');
    vi.stubEnv('FLY_MACHINE_ID', 'machine-test');
    vi.stubEnv('FLY_REGION', 'lax');
    const lines: string[] = [];
    const runtime = createLogging({
      write: (line, done) => {
        lines.push(line);
        done();
      }
    });
    const logger = runtime.createLogger('browser');
    const circular: Record<string, unknown> = { count: 4n };
    circular.self = circular;
    logger.debug('hidden');
    withLogContext({ request_id: 'req-test' }, () =>
      logger.error(
        'Fetch failed\nretry exhausted',
        {
          event: 'fetch.failed',
          novel_id: 12,
          circular,
          upstream_url: 'https://user:password@example.org/page?token=secret#hash',
          authorization: 'Bearer secret',
          cookie: 'private'
        },
        new TypeError('Request failed: https://user:password@example.org/page?token=secret')
      )
    );
    logger.warn('Non-Error rejection', {}, 42n);
    await runtime.forceFlush();
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.split('\n').length === 2)).toBe(true);
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({
      severity_text: 'ERROR',
      severity_number: 17,
      scope: 'browser',
      body: 'Fetch failed\nretry exhausted',
      resource: {
        'service.name': 'test-service',
        'service.version': expect.any(String),
        'service.instance.id': 'machine-test',
        'cloud.region': 'lax'
      },
      attributes: {
        request_id: 'req-test',
        event: 'fetch.failed',
        novel_id: 12,
        circular: { count: '4', self: '[Circular]' },
        upstream_url: 'https://example.org/page',
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        'exception.type': 'TypeError',
        'exception.message': 'Request failed: https://example.org/page'
      }
    });
    expect(Date.parse(record.timestamp)).not.toBeNaN();
    expect(record.attributes['exception.stacktrace']).toContain('TypeError');
    expect(lines.join('')).not.toContain('token=secret');
    expect(JSON.parse(lines[1]).attributes).toMatchObject({
      'exception.type': 'bigint',
      'exception.message': '"42"'
    });
    expect(getLogContext()).toEqual({});
    await runtime.shutdown();
  });

  it('honors LOG_LEVEL and contains serialization and output failures', async () => {
    vi.stubEnv('LOG_LEVEL', 'error');
    const failure = new Error('broken pipe');
    const onError = vi.fn();
    const write = vi.fn((_line: string, done: (error?: Error) => void) => done(failure));
    const runtime = createLogging({ write, onError });
    const logger = runtime.createLogger('test');
    logger.info('filtered');
    expect(write).not.toHaveBeenCalled();
    expect(() => logger.error('visible')).not.toThrow();
    await runtime.forceFlush();
    expect(onError).toHaveBeenCalledWith(failure);
    const attributes = {
      get value(): string {
        throw new Error('getter failed');
      }
    };
    expect(() => logger.error('bad getter', attributes)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(2);
    await runtime.shutdown();
  });

  it('waits for asynchronous writes and makes shutdown idempotent', async () => {
    const callbacks: (() => void)[] = [];
    const runtime = createLogging({ write: (_line, done) => callbacks.push(done) });
    const logger = runtime.createLogger('test');
    logger.info('last event');
    // SimpleLogRecordProcessor dispatches on a microtask.
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    let finished = false;
    const shutdown = runtime.shutdown();
    expect(runtime.shutdown()).toBe(shutdown);
    void shutdown.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    callbacks[0]();
    await shutdown;
    expect(finished).toBe(true);
    logger.info('after shutdown');
    expect(callbacks).toHaveLength(1);
  });

  it('bounds drain time for an unresponsive output sink', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const runtime = createLogging({ write: () => {} });
    runtime.createLogger('test').info('pending');
    const started = performance.now();
    await runtime.shutdown(20);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('reuses process initialization and installs signal listeners only once', () => {
    const runtime = initializeLogging({ write: (_line, done) => done() });
    expect(initializeLogging()).toBe(runtime);
    const before = process.listenerCount('SIGTERM');
    const remove = installProcessHandlers();
    expect(installProcessHandlers()).toBe(remove);
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    remove();
    expect(process.listenerCount('SIGTERM')).toBe(before);
    expect(safeUrl('https://u:p@example.org/a?q=private#hash')).toBe('https://example.org/a');
  });
});
