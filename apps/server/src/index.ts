import { serve } from '@hono/node-server';
import { createApp as createServerApp } from './app';
import { createLogger, addShutdownHook, shutdownLogging } from './logging';
const logger = createLogger('server');

export { createApp } from './app';

export interface ListenOptions {
  host?: string;

  port?: string | number;
}

export function startServer(app: ReturnType<typeof createServerApp>, options: ListenOptions) {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ? +options.port : 3000;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: host,
      port
    },
    (info) => {
      logger.info('Server started', {
        event: 'server.started',
        address: info.address,
        port: info.port
      });
    }
  );

  const removeHook = addShutdownHook(
    () => new Promise<void>((resolve) => server.close(() => resolve()))
  );
  return new Promise<void>((res) => {
    server.addListener('close', () => {
      removeHook();
      res();
    });
    server.addListener('error', (err) => {
      logger.error('Server failed', { event: 'server.failed' }, err);
      void shutdownLogging().finally(() => process.exit(1));
    });
  });
}

export { startCron } from './app';

export type { AppEnv, AppVariables, Context, ServiceBindings } from './app';
