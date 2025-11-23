import { Hono } from 'hono';
import { logger } from 'hono/logger';

import type { AppEnv, Context } from './env';

import { app as bilinovel } from './bilinovel';
import { launchBrowser } from './browser';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  await next();

  c.res.headers.set('X-Request-Id', requestId);
});

app.use('*', logger());

app.notFound((c) => {
  return c.json(
    {
      ok: false,
      message: 'Not Found'
    },
    404
  );
});

app.onError((err, c) => {
  console.error('Unhandled error', err);

  return c.json(
    {
      ok: false,
      message: 'Internal Server Error'
    },
    500
  );
});

app.get('/', (c) =>
  c.json({
    ok: true,
    message: 'lnovel.animes.garden'
  })
);

app.route('/bili/', bilinovel);

app.get('/html/', async (c) => {
  const searchParams = new URL(c.req.url).searchParams;
  const url = new URL(searchParams.get('url')!).toString();

  const html = await launchBrowser(c, async (page) => {
    const resp = await page.goto(url);
    console.log('[browser]', resp!.request().headers(), page.viewport(), await page.cookies());
    return await page.content();
  });

  return c.json({
    ok: true,
    html
  });
});

export default app;
