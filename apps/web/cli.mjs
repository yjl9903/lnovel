import { config } from 'dotenv';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';

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

const { default: handler } = await import('./dist/server/server.js');
if (values.cron) {
  const { startCron } = await import('@lnovel/server');
  await startCron();
}

serve(
  {
    fetch: handler.fetch,
    hostname: values.host ?? process.env.HOST ?? '0.0.0.0',
    port: Number(values.port ?? process.env.PORT ?? 3000)
  },
  (info) => console.log(`Start listening on http://${info.address}:${info.port}`)
);
