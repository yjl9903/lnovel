import 'dotenv/config';

import { breadc } from 'breadc';
import { createConsola } from 'consola';

import { description, version } from '../package.json';

import { createApp, startCron, startServer } from './index';

const consola = createConsola().withTag('cli');

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

consola.wrapConsole();

process.on('uncaughtException', (err) => {
  consola.error('Uncaught Exception', err);
});

process.on('unhandledRejection', (err) => {
  consola.error('Unhandled Rejection', err);
});

await app.run(process.argv.slice(2)).catch((err) => console.error(err));
