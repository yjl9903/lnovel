import { type Context as HonoContext, Hono } from 'hono';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import { app as bilinovel } from './bilinovel';

export type ServiceBindings = {};

export type AppVariables = {
  requestId: string;
};

export type AppEnv = {
  Bindings: ServiceBindings;
  Variables: AppVariables;
};

export type Context = HonoContext<AppEnv>;

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);

    await next();

    c.res.headers.set('X-Request-Id', requestId);
    c.res.headers.set('X-Response-Timestamp', new Date().toISOString());
  });

  app.use('*', logger());
  app.use('*', prettyJSON({ space: 2 }));

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

  app.get('/health', (c) =>
    c.json({
      ok: true,
      message: 'lnovel.animes.garden'
    })
  );

  app.route('/bili/', bilinovel);

  app.get('/html/', async (c) => {
    // const searchParams = new URL(c.req.url).searchParams;
    // const url = new URL(searchParams.get('url')!).toString();
    // const html = await launchBrowser(c, async (page) => {
    //   const resp = await page.goto(url);
    //   console.log('[browser]', resp!.request().headers(), page.viewport(), await page.cookies());
    //   return await page.content();
    // });
    // return c.json({
    //   ok: true,
    //   html
    // });
  });

  return app;
}
