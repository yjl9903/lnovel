import 'dotenv/config';

import { breadc } from 'breadc';
import { consola } from 'consola';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';

import { version } from '../package.json';

import { startServer } from './server';
import { createApp, startCron } from './app';

const app = breadc('lnovel-server', { description: 'lnovel API server', version })
  .option('--secret <string>', 'Admin auth secret')
  .option('--redis-uri <string>', 'Redis connection URI');

app
  .command('', 'Start lnovel server')
  .alias('start')
  .option('--site <site>', 'Web site host')
  .option('--host <ip>', 'Listen host')
  .option('--port <port>', 'Listen port')
  .option('--import', 'Import bangumi data', { default: false })
  .action(async (options) => {
    const host = options.host ?? process.env.HOST;
    const port = options.port ?? process.env.PORT;

    const app = createApp();
    await startCron();
    await startServer(app, { host, port });
  });

consola.wrapConsole();

process.on('uncaughtException', (err) => {
  console.error('[global]', 'uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[global]', 'unhandledRejection', err);
});

setGlobalDispatcher(new EnvHttpProxyAgent());

await app.run(process.argv.slice(2)).catch((err) => console.error(err));
