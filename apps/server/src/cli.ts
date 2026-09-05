import 'dotenv/config';

import { breadc } from 'breadc';

import { description, version } from '../package.json';
import {
  initializeLogging,
  createLogger,
  installProcessHandlers,
  shutdownLogging
} from './logging';

initializeLogging({ serviceName: 'lnovel-server' });
installProcessHandlers();

const { createApp, startCron, startServer } = await import('./index');

const logger = createLogger('cli');

const app = breadc('lnovel-server', { description, version })
  .option('--secret <string>', 'Admin auth secret')
  .option('--redis-uri <string>', 'Redis connection URI');

app
  .command('start', 'Start lnovel server')
  .alias('')
  .option('--host <ip>', 'Listen host')
  .option('--port <port>', 'Listen port')
  .option('--cron', 'Start cron job')
  .action(async (options) => {
    const host = options.host || process.env.HOST;
    const port = options.port || process.env.PORT;

    const app = createApp();
    options.cron && (await startCron());
    await startServer(app, { host, port });
  });

app.command('bili novel <nid>').action(async (nid: string) => {});

app.command('bili volume <nid> <vid>').action(async (nid: string, vid: string) => {});

app.command('bili chapter <nid> <cid>').action(async (nid: string, cid: string) => {});

await app.run(process.argv.slice(2)).catch(async (error) => {
  logger.error('Command failed', { event: 'cli.failed' }, error);
  await shutdownLogging();
  process.exitCode = 1;
});
