import { serve } from '@hono/node-server';
import { consola } from 'consola';
import { createApp } from './app';

export interface ListenOptions {
  host?: string;

  port?: string | number;
}

export function startServer(app: ReturnType<typeof createApp>, options: ListenOptions) {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ? +options.port : 3000;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: host,
      port
    },
    (info) => {
      consola.withTag('server').info(`Start listening on http://${info.address}:${info.port}`);
    }
  );

  return new Promise<void>((res) => {
    server.addListener('close', () => res());
    server.addListener('error', (err) => {
      consola.withTag('server').error(err);
      process.exit(1);
    });
  });
}
