import { config } from 'dotenv';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  initializeLogging,
  createLogger,
  installProcessHandlers,
  addShutdownHook
} from '@lnovel/server/logging';

config({
  path: [
    fileURLToPath(new URL('./.env', import.meta.url)),
    fileURLToPath(new URL('../../.env', import.meta.url))
  ],
  quiet: true
});

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { host: { type: 'string' }, port: { type: 'string' }, cron: { type: 'boolean' } }
});

if (positionals.length && (positionals.length !== 1 || positionals[0] !== 'start')) {
  throw new Error('Usage: node apps/web/cli.mjs [start] [--host HOST] [--port PORT] [--cron]');
}

process.env.NODE_ENV ??= 'production';
process.env.WEB_ASSET_ROOT = fileURLToPath(new URL('./dist/client', import.meta.url));

initializeLogging({ serviceName: 'lnovel-web' });
installProcessHandlers();
const logger = createLogger('web');
const { default: handler } = await import('./dist/server/server.js');
if (values.cron) {
  const { startCron } = await import('@lnovel/server');
  await startCron();
}

const server = serve(
  {
    fetch: handler.fetch,
    hostname: values.host ?? process.env.HOST ?? '0.0.0.0',
    port: Number(values.port ?? process.env.PORT ?? 3000)
  },
  (info) =>
    logger.info('Server started', {
      event: 'server.started',
      address: info.address,
      port: info.port
    })
);

addShutdownHook(() => new Promise((resolve) => server.close(() => resolve())));
