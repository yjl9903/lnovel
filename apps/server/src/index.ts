import { serve } from '@hono/node-server';
import { consola, createApp as createServerApp } from './app';

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
      consola.log(`Start listening on http://${info.address}:${info.port}`);
    }
  );

  return new Promise<void>((res) => {
    server.addListener('close', () => res());
    server.addListener('error', (err) => {
      consola.error(err);
      process.exit(1);
    });
  });
}

export { startCron } from './app';

export type { AppEnv, AppVariables, Context, ServiceBindings } from './app';
