import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { format } from 'node:util';

import type { MiddlewareHandler } from 'hono';

import { SeverityNumber, type LogAttributes } from '@opentelemetry/api-logs';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  type LogRecordExporter,
  type ReadableLogRecord
} from '@opentelemetry/sdk-logs';

import { version } from '../package.json';

export type Attributes = Record<string, unknown>;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = Record<
  LogLevel,
  (message: string, attributes?: Attributes, error?: unknown) => void
>;
export type LogContext = Attributes & {
  request_id?: string;
  task_id?: string;
  parent_task_id?: string;
  trigger_request_id?: string;
};
const levels = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR
};

// Shared by source imports, bundle chunks and development module reloads.
const stateKey = Symbol.for('lnovel.logging.v1');
type State = {
  context: AsyncLocalStorage<LogContext>;
  runtime?: ReturnType<typeof createLogging>;
  handlers?: () => void;
  stops: Set<() => void | Promise<void>>;
};
const globalState = globalThis as typeof globalThis & { [stateKey]?: State };
const state = (globalState[stateKey] ??= { context: new AsyncLocalStorage(), stops: new Set() });

export function getLogContext(): LogContext {
  return state.context.getStore() ?? {};
}
export function withLogContext<T>(context: LogContext, action: () => T): T {
  return state.context.run(context, action);
}

export function safeUrl(value: string | URL): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

// Error messages from browser clients can contain credential-bearing URLs too.
function cleanText(value: string): string {
  return value.replace(/(?:https?|wss?):\/\/[^\s"'<>]+/g, (url) => safeUrl(url));
}

function safeValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value == null) return null;
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth > 8) return '[MaxDepth]';
  seen.add(value);
  try {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof URL) return safeUrl(value);
    if (value instanceof Error)
      return {
        type: value.name,
        message: cleanText(value.message),
        stacktrace: cleanText(value.stack ?? '')
      };
    if (Array.isArray(value)) return value.map((entry) => safeValue(entry, seen, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /^(authorization|cookie|set-cookie|password|token|secret|headers|request_body)$/i.test(key)
          ? '[REDACTED]'
          : safeValue(entry, seen, depth + 1)
      ])
    );
  } finally {
    seen.delete(value);
  }
}

function diagnostic(error: unknown) {
  try {
    process.stderr.write(
      JSON.stringify({ event: 'logging.failed', message: cleanText(String(error)) }) + '\n'
    );
  } catch {
    /* Logging must not throw. */
  }
}

export interface LoggingOptions {
  serviceName?: string;
  level?: LogLevel;
  write?: (line: string, done: (error?: Error | null) => void) => void;
  onError?: (error: unknown) => void;
}

export class JsonLogRecordExporter implements LogRecordExporter {
  private readonly pending = new Set<Promise<void>>();
  private closed = false;
  constructor(
    private readonly write: NonNullable<LoggingOptions['write']> = (line, done) => {
      process.stdout.write(line, done);
    },
    private readonly onError: NonNullable<LoggingOptions['onError']> = diagnostic
  ) {}

  export(records: ReadableLogRecord[], done: (result: ExportResult) => void): void {
    if (this.closed) {
      done({ code: ExportResultCode.FAILED });
      return;
    }
    const failures: Error[] = [];
    const writes = records.map((record) => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      this.pending.add(pending);
      let complete = false;
      const settled = (error?: Error | null) => {
        if (complete) return;
        complete = true;
        if (error) {
          failures.push(error);
          try {
            this.onError(error);
          } catch {
            /* Independent diagnostic sink. */
          }
        }
        this.pending.delete(pending);
        finish();
      };
      try {
        const line = JSON.stringify({
          timestamp: new Date(record.hrTime[0] * 1000 + record.hrTime[1] / 1e6).toISOString(),
          severity_text: record.severityText,
          severity_number: record.severityNumber,
          body: record.body,
          scope: record.instrumentationScope.name,
          resource: record.resource.attributes,
          attributes: record.attributes
        });
        this.write(line + '\n', settled);
      } catch (error) {
        settled(error instanceof Error ? error : new Error(String(error)));
      }
      return pending;
    });
    void Promise.all(writes).then(() =>
      done(
        failures.length
          ? { code: ExportResultCode.FAILED, error: failures[0] }
          : { code: ExportResultCode.SUCCESS }
      )
    );
  }

  async forceFlush(): Promise<void> {
    await Promise.all([...this.pending]);
  }
  async shutdown(): Promise<void> {
    this.closed = true;
    await this.forceFlush();
  }
}

/** Creates an isolated runtime; process-wide initialization uses initializeLogging. */
export function createLogging(options: LoggingOptions = {}) {
  const configured = options.level ?? process.env.LOG_LEVEL ?? 'info';
  const minimum = levels[configured as LogLevel] ?? levels.info;
  const exporter = new JsonLogRecordExporter(options.write, options.onError);
  const provider = new LoggerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({
        'service.name': process.env.OTEL_SERVICE_NAME || options.serviceName || 'lnovel-server',
        'service.version': version,
        'deployment.environment.name': process.env.NODE_ENV || 'development',
        ...(process.env.FLY_MACHINE_ID
          ? { 'service.instance.id': process.env.FLY_MACHINE_ID }
          : {}),
        ...(process.env.FLY_REGION ? { 'cloud.region': process.env.FLY_REGION } : {})
      })
    ),
    processors: [new SimpleLogRecordProcessor({ exporter })]
  });
  let closed = false;
  let shutdown: Promise<void> | undefined;
  const loggers = new Map<string, Logger>();
  return {
    createLogger(scope: string): Logger {
      const cached = loggers.get(scope);
      if (cached) return cached;
      const logger = provider.getLogger(scope);
      const facade = Object.fromEntries(
        Object.entries(levels).map(([level, severity]) => [
          level,
          (message: string, attributes: Attributes = {}, error?: unknown) => {
            if (closed || severity < minimum) return;
            try {
              const exception =
                error === undefined
                  ? {}
                  : error instanceof Error
                    ? {
                        'exception.type': error.name,
                        'exception.message': error.message,
                        'exception.stacktrace': error.stack ?? ''
                      }
                    : {
                        'exception.type': typeof error,
                        'exception.message':
                          typeof error === 'string' ? error : JSON.stringify(safeValue(error))
                      };
              logger.emit({
                timestamp: new Date(),
                severityNumber: severity,
                severityText: level.toUpperCase(),
                body: cleanText(message),
                attributes: safeValue({
                  ...getLogContext(),
                  ...attributes,
                  ...exception
                }) as LogAttributes
              });
            } catch (error) {
              try {
                (options.onError ?? diagnostic)(error);
              } catch {
                /* Do not interrupt business code. */
              }
            }
          }
        ])
      ) as Logger;
      loggers.set(scope, facade);
      return facade;
    },
    async forceFlush() {
      await provider.forceFlush();
      await exporter.forceFlush();
    },
    shutdown(timeoutMs = 3000) {
      if (shutdown) return shutdown;
      closed = true;
      shutdown = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            provider.shutdown(),
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                diagnostic('Log drain timed out');
                resolve();
              }, timeoutMs);
            })
          ]);
        } catch (error) {
          diagnostic(error);
        } finally {
          clearTimeout(timer);
        }
      })();
      return shutdown;
    }
  };
}

export function initializeLogging(options: LoggingOptions = {}) {
  return (state.runtime ??= createLogging(options));
}
export function createLogger(scope: string): Logger {
  // Creating/importing a logger alone has no runtime effects during builds.
  return Object.fromEntries(
    Object.keys(levels).map((level) => [
      level,
      (message: string, attributes?: Attributes, error?: unknown) =>
        initializeLogging().createLogger(scope)[level as LogLevel](message, attributes, error)
    ])
  ) as Logger;
}
export async function shutdownLogging(timeoutMs = 3000) {
  await state.runtime?.shutdown(timeoutMs);
}

/** Only for libraries exposing console-shaped logger injection. */
export function consoleLogger(logger: Logger): Pick<Console, 'log' | 'info' | 'warn' | 'error'> {
  const write =
    (level: LogLevel) =>
    (...args: unknown[]) => {
      try {
        const error = args.find((arg) => arg instanceof Error);
        logger[level](format(...args.filter((arg) => !(arg instanceof Error))), undefined, error);
      } catch (error) {
        logger.error('Cannot format library log', { event: 'logging.format.failed' }, error);
      }
    };
  return { log: write('info'), info: write('info'), warn: write('warn'), error: write('error') };
}

export function addShutdownHook(stop: () => void | Promise<void>) {
  state.stops.add(stop);
  return () => {
    state.stops.delete(stop);
  };
}

export function installProcessHandlers() {
  if (state.handlers) return state.handlers;
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(code), 3000);
    const logger = createLogger('process');
    logger.info('Server stopping', { event: 'server.stopping' });
    try {
      // Invoke every hook immediately, including stopping HTTP admission and cron.
      const stops = [...state.stops].map(async (hook) => {
        await hook();
      });
      let grace: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(stops),
        new Promise<void>((resolve) => {
          grace = setTimeout(resolve, 1000);
        })
      ]);
      clearTimeout(grace);
      await shutdownLogging(1900);
    } finally {
      clearTimeout(deadline);
      process.exit(code);
    }
  };
  const signal = () => {
    void stop(0);
  };
  const fatal = (error: unknown) => {
    createLogger('process').error('Unhandled process error', { event: 'process.failed' }, error);
    void stop(1);
  };
  process.on('SIGINT', signal);
  process.on('SIGTERM', signal);
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
  state.handlers = () => {
    process.off('SIGINT', signal);
    process.off('SIGTERM', signal);
    process.off('uncaughtException', fatal);
    process.off('unhandledRejection', fatal);
    state.handlers = undefined;
  };
  return state.handlers;
}

export async function runTask<T>(
  name: string,
  attributes: Attributes,
  action: () => Promise<T>
): Promise<T> {
  const parent = getLogContext();
  const sameNovel = attributes.novel_id === undefined || attributes.novel_id === parent.novel_id;
  const sameVolume =
    attributes.volume_id === undefined || attributes.volume_id === parent.volume_id;
  const entity = {
    ...(parent.novel_id !== undefined ? { novel_id: parent.novel_id } : {}),
    ...(sameNovel && parent.volume_id !== undefined ? { volume_id: parent.volume_id } : {}),
    ...(sameNovel && sameVolume && parent.chapter_id !== undefined
      ? { chapter_id: parent.chapter_id }
      : {})
  };
  const context: LogContext = {
    ...entity,
    ...attributes,
    task_id: randomUUID(),
    ...(parent.task_id ? { parent_task_id: parent.task_id } : {}),
    ...(parent.request_id || parent.trigger_request_id
      ? { trigger_request_id: parent.request_id ?? parent.trigger_request_id }
      : {})
  };
  return withLogContext(context, async () => {
    const logger = createLogger('task');
    const start = performance.now();
    logger.info('Task started', { event: 'task.started', task_name: name });
    try {
      const result = await action();
      logger.info('Task completed', {
        event: 'task.completed',
        task_name: name,
        duration_ms: performance.now() - start
      });
      return result;
    } catch (error) {
      logger.error(
        'Task failed',
        { event: 'task.failed', task_name: name, duration_ms: performance.now() - start },
        error
      );
      throw error;
    }
  });
}

export function scheduleTask(
  name: string,
  attributes: Attributes,
  action: () => Promise<unknown>,
  delay: number
) {
  const parent = { ...getLogContext() };
  return setTimeout(() => {
    void withLogContext(parent, () => runTask(name, attributes, action)).catch(() => {});
  }, delay);
}

export function requestLogging(kind: 'web' | 'api'): MiddlewareHandler {
  const logger = createLogger(kind);
  return async (c, next) => {
    const parent = getLogContext();
    const internal = kind === 'api' && Boolean(parent.request_id || parent.task_id);
    const requestId = internal && parent.request_id ? parent.request_id : randomUUID();
    const context = internal ? { ...parent, request_id: requestId } : { request_id: requestId };
    c.set('requestId', requestId);
    await withLogContext(context, async () => {
      const start = performance.now();
      try {
        await next();
      } finally {
        const status = c.res.status;
        const pathname = new URL(c.req.url).pathname;
        const quiet =
          pathname === '/health' ||
          c.get('logStaticAsset') === true ||
          /^\/bili\/(files|img3)(\/|$)/.test(pathname);
        const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : quiet ? 'debug' : 'info';
        logger[level]('Request completed', {
          event: internal ? 'api.call.completed' : 'http.request.completed',
          method: c.req.method,
          pathname,
          status,
          duration_ms: performance.now() - start
        });
      }
    });
  };
}
